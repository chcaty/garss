import socket
import unittest
from unittest.mock import patch

from garss.link_health import check_link, public_url


class Response:
    def __init__(self, status=200, body=b'<rss version="2.0"><channel><title>Example</title><link>https://example.com</link><description>Empty feed</description></channel></rss>', headers=None):
        self.status_code, self.body = status, body
        self.headers = headers or {}
        self.closed = False

    def iter_content(self, size):
        yield self.body

    def close(self):
        self.closed = True


class LinkHealthTests(unittest.TestCase):
    def check(self, response):
        return check_link('https://example.com/feed', request_get=lambda *a, **k: response, validate_url=lambda url: None)

    def test_empty_rss_is_valid_but_html_is_not(self):
        response = Response()
        self.assertEqual(self.check(response)['status'], 'valid')
        self.assertTrue(response.closed)
        self.assertEqual(self.check(Response(body=b'<html><title>Login</title></html>'))['status'], 'invalid')

    def test_http_errors_preserve_uncertainty(self):
        for status in [403, 429, 500]:
            with self.subTest(status=status):
                self.assertEqual(self.check(Response(status=status))['status'], 'unknown')
        for status in [404, 410]:
            self.assertEqual(self.check(Response(status=status))['status'], 'invalid')

    def test_redirect_is_validated_before_request_and_response_closed(self):
        response = Response(status=302, headers={'Location': 'http://127.0.0.1/private'})
        requests = []
        def get(url, **kwargs):
            requests.append(url)
            return response
        def validate(url):
            if '127.0.0.1' in url:
                raise ValueError('non-public address')
        result = check_link('https://example.com/feed', request_get=get, validate_url=validate)
        self.assertEqual(result['status'], 'unknown')
        self.assertEqual(len(requests), 1)
        self.assertTrue(response.closed)

    def test_private_dns_and_credentials_rejected(self):
        with patch('socket.getaddrinfo', return_value=[(socket.AF_INET, socket.SOCK_STREAM, 6, '', ('127.0.0.1', 443))]):
            with self.assertRaises(ValueError):
                public_url('https://example.com/feed')
        with self.assertRaises(ValueError):
            public_url('https://user:password@example.com/feed')

    def test_budget_and_size_limit(self):
        self.assertEqual(check_link('https://example.com', validate_url=lambda url: None, clock=iter([0, 16]).__next__)['status'], 'unknown')
        with patch('garss.link_health.MAX_BYTES', 1):
            self.assertEqual(self.check(Response())['status'], 'unknown')
