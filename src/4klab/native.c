/* Isolated Tizen worker transport. No listener is opened until lab_listen(). */
#include <arpa/inet.h>
#include <curl/curl.h>
#include <errno.h>
#include <fcntl.h>
#include <poll.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>
#include <sys/socket.h>
#include <unistd.h>
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define API EMSCRIPTEN_KEEPALIVE
#else
#define API
#endif

#define MAX_BODY (16 * 1024 * 1024)
#ifndef FABORN_CA_PATH
#define FABORN_CA_PATH "/cacert.pem"
#endif
static CURL *http;
static unsigned char *body;
static size_t body_size, body_limit;
static char error_text[CURL_ERROR_SIZE], location[8192], content_range[160];
static char request_buffer[8193];
static int listener = -1, client = -1;

static size_t receive_body(void *data, size_t size, size_t n, void *unused) {
    (void)unused;
    size_t len = size * n;
    if (len > body_limit - body_size) return 0;
    unsigned char *next = realloc(body, body_size + len + 1);
    if (!next) return 0;
    body = next;
    memcpy(body + body_size, data, len);
    body_size += len;
    body[body_size] = 0;
    return len;
}
static void header_value(char *out, size_t cap, const char *in, size_t len) {
    while (len && (*in == ' ' || *in == '\t')) { in++; len--; }
    while (len && (in[len-1] == '\r' || in[len-1] == '\n' || in[len-1] == ' ')) len--;
    if (len >= cap) { *out = 0; return; }
    memcpy(out, in, len); out[len] = 0;
}
static size_t receive_header(char *data, size_t size, size_t n, void *unused) {
    (void)unused;
    size_t len = size * n;
    if (len > 5 && !strncasecmp(data, "HTTP/", 5)) { location[0] = 0; content_range[0] = 0; }
    if (len > 9 && !strncasecmp(data, "Location:", 9)) header_value(location, sizeof(location), data + 9, len - 9);
    if (len > 14 && !strncasecmp(data, "Content-Range:", 14)) header_value(content_range, sizeof(content_range), data + 14, len - 14);
    return len;
}
API int lab_init(void) {
    if (http) return 1;
    if (curl_global_init(CURL_GLOBAL_DEFAULT)) return 0;
    http = curl_easy_init();
    return http != NULL;
}
/* Redirects are deliberately handled by the worker, which validates each destination. */
API int lab_get(const char *url, const char *origin, const char *referer,
                const char *post, const char *borth, const char *range, int limit) {
    if (!http || !url || strncmp(url, "https://", 8)) return -1;
    if (strpbrk(url, "\r\n") || strpbrk(origin, "\r\n") || strpbrk(referer, "\r\n") || strpbrk(borth, "\r\n")) return -1;
    free(body); body = NULL; body_size = 0;
    body_limit = limit > 0 && limit <= MAX_BODY ? (size_t)limit : MAX_BODY;
    error_text[0] = location[0] = content_range[0] = 0;
    curl_easy_reset(http);
    curl_easy_setopt(http, CURLOPT_URL, url);
    curl_easy_setopt(http, CURLOPT_PROTOCOLS, CURLPROTO_HTTPS);
    curl_easy_setopt(http, CURLOPT_FOLLOWLOCATION, 0L);
    curl_easy_setopt(http, CURLOPT_PROXY, "");
    curl_easy_setopt(http, CURLOPT_USERAGENT, "Mozilla/5.0");
    curl_easy_setopt(http, CURLOPT_CONNECTTIMEOUT, 8L);
    curl_easy_setopt(http, CURLOPT_TIMEOUT, 20L);
    curl_easy_setopt(http, CURLOPT_LOW_SPEED_LIMIT, 1024L);
    curl_easy_setopt(http, CURLOPT_LOW_SPEED_TIME, 12L);
    curl_easy_setopt(http, CURLOPT_NOSIGNAL, 1L);
    curl_easy_setopt(http, CURLOPT_CAINFO, FABORN_CA_PATH);
    curl_easy_setopt(http, CURLOPT_SSL_VERIFYPEER, 1L);
    curl_easy_setopt(http, CURLOPT_SSL_VERIFYHOST, 2L);
    curl_easy_setopt(http, CURLOPT_COOKIEFILE, "");
    curl_easy_setopt(http, CURLOPT_ACCEPT_ENCODING, "");
    curl_easy_setopt(http, CURLOPT_ERRORBUFFER, error_text);
    curl_easy_setopt(http, CURLOPT_WRITEFUNCTION, receive_body);
    curl_easy_setopt(http, CURLOPT_HEADERFUNCTION, receive_header);
    if (*referer) curl_easy_setopt(http, CURLOPT_REFERER, referer);
    if (*range) curl_easy_setopt(http, CURLOPT_RANGE, range);
    struct curl_slist *headers = NULL;
    char value[4096];
    if (*origin && strlen(origin) < 2000) {
        snprintf(value, sizeof(value), "Origin: %s", origin);
        headers = curl_slist_append(headers, value);
    }
    if (*borth && strlen(borth) < 2000) {
        snprintf(value, sizeof(value), "Borth: %s", borth);
        headers = curl_slist_append(headers, value);
        headers = curl_slist_append(headers, "X-Requested-With: XMLHttpRequest");
    }
    if (*post) {
        headers = curl_slist_append(headers, "Content-Type: application/x-www-form-urlencoded");
        curl_easy_setopt(http, CURLOPT_POSTFIELDS, post);
    }
    curl_easy_setopt(http, CURLOPT_HTTPHEADER, headers);
    CURLcode result = curl_easy_perform(http);
    long status = 0;
    curl_easy_getinfo(http, CURLINFO_RESPONSE_CODE, &status);
    curl_slist_free_all(headers);
    if (result != CURLE_OK) {
        if (!*error_text) snprintf(error_text, sizeof(error_text), "cURL %d", result);
        return -(int)result;
    }
    return (int)status;
}
API const unsigned char *lab_body(void) { return body; }
API int lab_size(void) { return (int)body_size; }
API const char *lab_error(void) { return error_text; }
API const char *lab_location(void) { return location; }
API const char *lab_range(void) { return content_range; }

API void lab_close_client(void) {
    if (client >= 0) { shutdown(client, SHUT_RDWR); close(client); client = -1; }
}
API void lab_stop(void) {
    lab_close_client();
    if (listener >= 0) { close(listener); listener = -1; }
    free(body); body = NULL; body_size = 0;
    if (http) { curl_easy_cleanup(http); http = NULL; curl_global_cleanup(); }
}
API int lab_listen(void) {
    if (listener >= 0) return -1;
    listener = socket(AF_INET, SOCK_STREAM, 0);
    if (listener < 0) return -2;
    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    addr.sin_port = 0;
    socklen_t size = sizeof(addr);
    if (bind(listener, (struct sockaddr *)&addr, size) || listen(listener, 4) ||
        getsockname(listener, (struct sockaddr *)&addr, &size) ||
        fcntl(listener, F_SETFL, O_NONBLOCK) < 0) {
        close(listener); listener = -1; return -3;
    }
    return ntohs(addr.sin_port);
}
API int lab_accept(void) {
    if (listener < 0 || client >= 0) return 0;
    struct pollfd p = {listener, POLLIN, 0};
    if (poll(&p, 1, 0) <= 0 || !(p.revents & POLLIN)) return 0;
    client = accept(listener, NULL, NULL);
    if (client < 0) return 0;
    if (fcntl(client, F_SETFL, O_NONBLOCK) < 0) { lab_close_client(); return -1; }
    return 1;
}
API int lab_read(void) {
    if (client < 0) return -1;
    int len = recv(client, request_buffer, sizeof(request_buffer)-1, 0);
    if (len < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) return 0;
    if (len <= 0) return -1;
    request_buffer[len] = 0;
    return len;
}
API const char *lab_request(void) { return request_buffer; }
API int lab_send(const void *data, int len) {
    if (client < 0 || len <= 0) return -1;
    int sent = send(client, data, len, 0);
    if (sent < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) return 0;
    return sent;
}
