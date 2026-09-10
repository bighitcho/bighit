"""One-time local OAuth helper. Run on the user's trusted computer, never CI.
Requires a Google OAuth Desktop client configured in environment variables.
Refresh tokens are saved locally with mode 0600; never printed or sent to GitHub.
"""
import argparse
import base64
import hashlib
import json
import os
import secrets
import time
import urllib.parse
import webbrowser
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from worker import API, request, required


def main():
    p=argparse.ArgumentParser(); p.add_argument("kind", choices=["drive", "youtube"])
    p.add_argument("--channel-id"); p.add_argument("--output", default=str(Path(__file__).with_name(".youtube-private-tokens.json")))
    a=p.parse_args()
    if a.kind=="youtube" and not a.channel_id:
        p.error("--channel-id is required for YouTube")
    state=secrets.token_urlsafe(32); verifier=secrets.token_urlsafe(64)
    challenge=base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    result={}
    class Callback(BaseHTTPRequestHandler):
        def log_message(self, *args): pass
        def do_GET(self):
            u=urllib.parse.urlparse(self.path); q=urllib.parse.parse_qs(u.query)
            if u.path!="/callback" or q.get("state", [None])[0]!=state:
                self.send_error(400); return
            result.update(code=q.get("code", [None])[0], error=q.get("error", [None])[0])
            self.send_response(200); self.send_header("Content-Type", "text/plain; charset=utf-8"); self.end_headers()
            self.wfile.write("로그인 응답을 받았습니다. 실행 창에서 채널 검증 결과를 확인하세요.".encode())
    server=HTTPServer(("127.0.0.1",0), Callback); server.timeout=1
    redirect=f"http://127.0.0.1:{server.server_port}/callback"
    scopes = ("https://www.googleapis.com/auth/drive" if a.kind=="drive" else
              "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly")
    params={"client_id":required("GOOGLE_CLIENT_ID"),"redirect_uri":redirect,"response_type":"code",
            "scope":scopes,"access_type":"offline","prompt":"consent select_account","state":state,
            "code_challenge":challenge,"code_challenge_method":"S256"}
    url="https://accounts.google.com/o/oauth2/v2/auth?"+urllib.parse.urlencode(params)
    print("브라우저에서 계정과 요청 권한을 확인하세요. 로그인 제한 시간은 5분입니다.")
    if not webbrowser.open(url):
        print("브라우저를 열 수 없습니다. 이 도구는 브라우저가 있는 본인 PC에서 실행해야 합니다.")
        return
    until=time.monotonic()+300
    while not result and time.monotonic()<until: server.handle_request()
    server.server_close()
    if not result.get("code"): raise SystemExit("로그인이 완료되지 않았습니다.")
    body=urllib.parse.urlencode({"client_id":required("GOOGLE_CLIENT_ID"),"client_secret":required("GOOGLE_CLIENT_SECRET"),
                                 "code":result["code"],"code_verifier":verifier,"redirect_uri":redirect,
                                 "grant_type":"authorization_code"}).encode()
    data=json.loads(request("POST","https://oauth2.googleapis.com/token",raw=body,
                            headers={"Content-Type":"application/x-www-form-urlencoded"})[2])
    if not data.get("refresh_token"): raise SystemExit("장기 연결 토큰을 받지 못했습니다.")
    output=Path(a.output).resolve()
    saved=json.loads(output.read_text()) if output.exists() else {}
    if a.kind=="drive":
        profile=json.loads(request("GET",API+"/drive/v3/about?fields=user(emailAddress)",data["access_token"])[2])
        if not profile.get("user",{}).get("emailAddress","").endswith("@greencap.or.kr"):
            raise SystemExit("그린캡 Workspace 계정이 아닙니다. 저장하지 않았습니다.")
        saved["drive_refresh_token"]=data["refresh_token"]
    else:
        channels=json.loads(request("GET",API+"/youtube/v3/channels?part=id,snippet&mine=true",data["access_token"])[2]).get("items",[])
        if a.channel_id not in [c["id"] for c in channels]:
            raise SystemExit("선택한 채널이 지정한 채널과 다릅니다. 저장하지 않았습니다.")
        saved.setdefault("youtube_channel_tokens",{})[a.channel_id]=data["refresh_token"]
    fd=os.open(output,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
    with os.fdopen(fd,"w") as f: json.dump(saved,f)
    os.chmod(output,0o600)
    print("계정 검증과 비공개 토큰 저장이 완료됐습니다. 토큰 파일은 채팅이나 저장소에 올리지 마세요.")

if __name__=="__main__": main()
