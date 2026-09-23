"""
Tests for rate limiting.

Rate limiting is disabled in the test environment (RATE_LIMIT_ENABLED
defaults to false outside production), so these tests verify the
*configuration* rather than the enforcement. Enabling it in tests
would make them order-dependent and slow.
"""


class TestRateLimitConfig:
    def test_disabled_in_test_environment(self):
        from backend.api.settings import RATE_LIMIT_ENABLED

        # Tests run with ENVIRONMENT=dev (the default), so rate
        # limiting is off.
        assert RATE_LIMIT_ENABLED is False

    def test_limiter_is_disabled_when_flag_is_false(self):
        from backend.api.rate_limit import limiter

        # The limiter reads the same flag.
        assert limiter.enabled is False

    def test_limits_are_configured(self):
        from backend.api.settings import (
            RATE_LIMIT_CHAT,
            RATE_LIMIT_NARRATE,
            RATE_LIMIT_REPORTS,
        )

        # Each is a string like "30/minute".
        for limit in (RATE_LIMIT_CHAT, RATE_LIMIT_NARRATE, RATE_LIMIT_REPORTS):
            assert "/" in limit
            count, period = limit.split("/", 1)
            assert count.isdigit()
            assert period in ("second", "minute", "hour", "day")


class TestRateLimitNotBlocking:
    def test_repeated_requests_succeed_when_disabled(self, client):
        """
        With rate limiting off, a burst of requests should all get
        through. This is the state the tests run in.
        """
        for _ in range(50):
            r = client.get("/api/health")
            assert r.status_code == 200