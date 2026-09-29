import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('builder', ROOT / 'scripts/build_catalog.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
MASTER = '''#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=5128000,RESOLUTION=3840x1600,CODECS="avc1.640033,mp4a.40.2"
2160/token/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2128000,RESOLUTION=1920x800
1080/token/index.m3u8
'''
BASE = 'https://ashdi.vip/video29/test/hls/index.m3u8'


class CatalogTests(unittest.TestCase):
    def test_cropped_4k_and_relative_variants(self):
        rows = builder.parse_master(MASTER, BASE)
        self.assertEqual([r['label'] for r in rows], ['2160p', '1080p'])
        self.assertEqual(rows[0]['width'], 3840)
        self.assertEqual(rows[0]['height'], 1600)
        self.assertEqual(rows[0]['url'], 'https://ashdi.vip/video29/test/hls/2160/token/index.m3u8')

    def test_no_fake_quality_from_filename(self):
        with self.assertRaises(ValueError):
            builder.parse_master('#EXTM3U\n#EXTINF:6,\na.ts', 'https://ashdi.vip/2160p/index.m3u8')

    def test_manifest_html_is_rejected(self):
        with self.assertRaises(ValueError):
            builder.parse_master('<html>challenge</html>', BASE)

    def test_offsite_media_rejected(self):
        with self.assertRaises(ValueError):
            builder.parse_master(MASTER.replace('2160/token/index.m3u8', 'https://other.example/video.m3u8'), BASE)
        for url in ['http://ashdi.vip/x', 'https://ashdi.vip.evil.test/x', 'https://evil@ashdi.vip/x', 'javascript:alert(1)']:
            self.assertFalse(builder.media_url(url))

    def test_player_literal_is_read_without_eval(self):
        body = "new Playerjs({id:'test', file:'https:\\/\\/ashdi.vip/test/index.m3u8', subtitle:'[Українські]https://ashdi.vip/sub/ua.vtt'})"
        master, subs = builder.parse_embed(body)
        self.assertEqual(master, 'https://ashdi.vip/test/index.m3u8')
        self.assertEqual(subs[0]['label'], 'Українські')

    def test_encoded_or_external_player_not_executed(self):
        for body in ["new Playerjs({file:danger()})", "new Playerjs({file:'https://evil.test/index.m3u8'})", '<html>blocked</html>']:
            with self.assertRaises(ValueError):
                builder.parse_embed(body)

    def test_uakino_voices_and_episodes(self):
        page = builder.SourcePage('https://uakino.best/example.html')
        page.feed('<li data-file="//ashdi.vip/vod/165929" data-voice="DniproFilm">Серія 1<span></span></li><li data-file="//ashdi.vip/vod/165950" data-voice="Uaflix">Серія 2</li>')
        self.assertEqual(page.episode_refs[0]['episode'], 1)
        self.assertEqual(page.episode_refs[1]['voice'], 'Uaflix')

    def test_kinoukr_ignores_other_hosts(self):
        page = builder.SourcePage('https://kinoukr.tv/example.html')
        page.feed('<iframe src="https://ashdi.vip/vod/189384"></iframe><iframe src="https://tortuga.tw/vod/1"></iframe>')
        self.assertEqual(page.embeds, ['https://ashdi.vip/vod/189384'])

    def test_failed_refresh_keeps_timestamp_and_marks_stale(self):
        config = json.loads((ROOT / 'config/sources.json').read_text())
        config['titles'] = config['titles'][:1]
        old = json.loads((ROOT / 'data/catalog.json').read_text())
        old['titles'] = old['titles'][:1]
        stamp = old['titles'][0]['releases'][0]['episodes'][0]['updatedAt']
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'config').mkdir(); (root / 'data').mkdir()
            (root / 'config/sources.json').write_text(json.dumps(config))
            (root / 'data/catalog.json').write_text(json.dumps(old))
            with patch.object(builder, 'fetch', side_effect=OSError('blocked')):
                result = builder.build(root, delay=0)
            episode = result['titles'][0]['releases'][0]['episodes'][0]
            self.assertEqual(episode['state'], 'stale')
            self.assertEqual(episode['updatedAt'], stamp)
            self.assertTrue(result['warnings'])

    def test_missing_ukrainian_evidence_fails(self):
        config = json.loads((ROOT / 'config/sources.json').read_text())
        config['titles'][0]['releases'][0]['audioLanguage'] = 'en'
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); (root / 'config').mkdir()
            (root / 'config/sources.json').write_text(json.dumps(config))
            with self.assertRaises(ValueError):
                builder.build(root, check_sources=False, delay=0)


if __name__ == '__main__':
    unittest.main()
