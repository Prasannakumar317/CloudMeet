"""
Unit tests for database utilities and URI sanitization.
"""

import unittest
from app.database import sanitize_mongodb_uri


class TestDatabaseSanitization(unittest.TestCase):
    def test_sanitize_empty_or_plain_uri(self):
        self.assertEqual(sanitize_mongodb_uri(""), "")
        self.assertEqual(sanitize_mongodb_uri("mongodb://localhost:27017"), "mongodb://localhost:27017")

    def test_sanitize_special_characters_in_password(self):
        raw = "mongodb+srv://admin:pass#123@cluster0.abc.mongodb.net/cloudmeet?retryWrites=true"
        sanitized = sanitize_mongodb_uri(raw)
        self.assertEqual(
            sanitized,
            "mongodb+srv://admin:pass%23123@cluster0.abc.mongodb.net/cloudmeet?retryWrites=true"
        )

    def test_sanitize_email_username_and_complex_password(self):
        raw = "mongodb+srv://user@domain.com:p@ss:w/ord@cluster0.mongodb.net/?retryWrites=true"
        sanitized = sanitize_mongodb_uri(raw)
        self.assertEqual(
            sanitized,
            "mongodb+srv://user%40domain.com:p%40ss%3Aw%2Ford@cluster0.mongodb.net/?retryWrites=true"
        )

    def test_sanitize_already_encoded_uri_no_double_encoding(self):
        raw = "mongodb+srv://admin:pass%23123@cluster0.abc.mongodb.net/cloudmeet"
        sanitized = sanitize_mongodb_uri(raw)
        self.assertEqual(
            sanitized,
            "mongodb+srv://admin:pass%23123@cluster0.abc.mongodb.net/cloudmeet"
        )


if __name__ == "__main__":
    unittest.main()
