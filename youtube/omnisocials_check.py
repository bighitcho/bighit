"""Read-only OmniSocials credential check. Never logs response bodies or account IDs."""
import json
import os
import sys
import urllib.error
import urllib.request
from collections import Counter

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def check():
    key = os.environ.get("OMNISOCIALS_API_KEY", "").strip()
    if not key:
        print("CHECK_FAILED: OMNISOCIALS_API_KEY is missing")
        return 1
    req = urllib.request.Request(
        "https://api.omnisocials.com/v1/accounts",
        headers={"Authorization": "Bearer " + key, "Accept": "application/json"},
        method="GET",
    )
    try:
        with urllib.request.build_opener(NoRedirect).open(req, timeout=40) as response:
            payload = json.loads(response.read(2_000_000))
        accounts = payload.get("data")
        if not isinstance(accounts, list) or not all(isinstance(a, dict) for a in accounts):
            print("CHECK_FAILED: unexpected accounts response")
            return 1
        allowed = {"youtube", "instagram", "facebook", "threads", "tiktok", "twitter", "x",
                   "linkedin", "pinterest", "bluesky", "google_business", "mastodon"}
        counts = Counter()
        for account in accounts:
            raw = account.get("platform", account.get("provider", "unknown"))
            platform = str(raw).lower()
            counts[platform if platform in allowed else "other"] += 1
        print(json.dumps({"connection": "ok", "http_status": 200,
                          "key_mode": "test" if key.startswith("omsk_test_") else "live_or_unspecified",
                          "account_count": len(accounts), "platform_counts": dict(counts)},
                         sort_keys=True))
        return 0
    except urllib.error.HTTPError as error:
        hints = {401: "invalid_key", 403: "accounts_read_scope_required",
                 429: "rate_limited"}
        print("CHECK_FAILED: HTTP " + str(error.code) + " " +
              hints.get(error.code, "request_rejected"))
    except Exception:
        print("CHECK_FAILED: network_or_response_error")
    return 1

if __name__ == "__main__":
    sys.exit(check())
