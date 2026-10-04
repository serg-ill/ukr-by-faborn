"""Exercise the native loopback C implementation on the host, without TV emulation."""
import ctypes
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]


class NativeLoopbackTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        compiler = shutil.which('clang') or shutil.which('cc')
        if not compiler:
            raise RuntimeError('C compiler required for native transport checks')
        lib = Path(cls.tmp.name) / 'native.so'
        subprocess.run([compiler, '-shared', '-fPIC', '-Wno-deprecated-declarations',
                        str(ROOT / 'src/4klab/native.c'), '-lcurl', '-o', str(lib)],
                       check=True, capture_output=True)
        cls.lib = ctypes.CDLL(str(lib))
        cls.lib.lab_request.restype = ctypes.c_char_p
        cls.lib.lab_send.argtypes = [ctypes.c_void_p, ctypes.c_int]
        cls.lib.lab_get.argtypes = [ctypes.c_char_p] * 6 + [ctypes.c_int]

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def tearDown(self):
        self.lib.lab_stop()

    def connection(self):
        port = self.lib.lab_listen()
        self.assertGreater(port, 0)
        sock = socket.create_connection(('127.0.0.1', port), timeout=2)
        deadline = time.monotonic() + 2
        accepted = self.lib.lab_accept()
        while accepted == 0 and time.monotonic() < deadline:
            time.sleep(.001)
            accepted = self.lib.lab_accept()
        self.assertEqual(accepted, 1)
        return sock

    def test_loopback_reads_http_and_returns_binary_without_corruption(self):
        with self.connection() as sock:
            request = b'GET /session/1.bin HTTP/1.1\r\nHost: 127.0.0.1:12345\r\nRange: bytes=0-255\r\n\r\n'
            sock.sendall(request)
            count = 0
            for _ in range(20):
                count = self.lib.lab_read()
                if count:
                    break
                time.sleep(.01)
            self.assertEqual(count, len(request))
            self.assertEqual(self.lib.lab_request(), request)
            body = bytes(range(256))
            response = b'HTTP/1.1 206 Partial Content\r\nContent-Length: 256\r\n\r\n' + body
            buffer = ctypes.create_string_buffer(response)
            self.assertEqual(self.lib.lab_send(buffer, len(response)), len(response))
            got = b''
            while len(got) < len(response):
                got += sock.recv(4096)
            self.assertEqual(got, response)

    def test_idle_accept_and_read_do_not_block_worker(self):
        with self.connection():
            before = time.monotonic()
            self.assertEqual(self.lib.lab_read(), 0)
            self.assertLess(time.monotonic() - before, .1)

    def test_stop_closes_port_and_allows_a_fresh_test(self):
        port = self.lib.lab_listen()
        self.assertGreater(port, 0)
        self.lib.lab_stop()
        with self.assertRaises(OSError):
            socket.create_connection(('127.0.0.1', port), timeout=.2)
        self.assertGreater(self.lib.lab_listen(), 0)

    def test_paused_reader_applies_backpressure_without_hanging_the_worker(self):
        with self.connection() as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 1024)
            buffer = ctypes.create_string_buffer(b'x' * 65536)
            blocked = False
            for _ in range(512):
                before = time.monotonic()
                count = self.lib.lab_send(buffer, 65536)
                self.assertLess(time.monotonic() - before, .5)
                self.assertGreaterEqual(count, 0)
                if count == 0:
                    blocked = True
                    break
            self.assertTrue(blocked, 'Loopback writer should pause when the player stops reading')

    def test_native_transport_rejects_non_https_and_header_injection(self):
        self.assertEqual(self.lib.lab_init(), 1)
        self.assertLess(self.lib.lab_get(b'file:///etc/passwd', b'', b'', b'', b'', b'', 1024), 0)
        self.assertLess(self.lib.lab_get(b'https://example.com', b'x\r\nBad: a', b'', b'', b'', b'', 1024), 0)


if __name__ == '__main__':
    unittest.main()
