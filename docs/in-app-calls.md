
# Eventis in-app calls

Chat voice and video calls use WebRTC media and the authenticated chat Socket.IO connection for call setup. They use internet data; the mobile carrier's voice dialer is not opened. Calls are supported between Eventis accounts in direct conversations.

## Network relay configuration

The API returns STUN settings and generates temporary TURN credentials for coturn. Set these API environment variables in production:

```env
CALL_STUN_URLS=stun:stun.l.google.com:19302
CALL_TURN_URLS=turn:turn.example.com:3478?transport=udp,turn:turn.example.com:3478?transport=tcp,turns:turn.example.com:5349
CALL_TURN_SHARED_SECRET=<same value as coturn static-auth-secret>
```

Configure coturn with `use-auth-secret`, `static-auth-secret` set to the same secret, and `realm` set to the TURN hostname. Open the TURN listener ports and the configured UDP relay port range in the firewall. TURN credentials expire after one hour and are only returned to authenticated app users. Keep the shared secret on the API and TURN server; never add it to the mobile app environment.

Without TURN, STUN-only connections work on some networks, while carrier-grade NAT and restrictive Wi-Fi can prevent calls from connecting.

## Mobile build and smoke test

Expo Go does not include the native WebRTC media module. Install an Eventis development or production build with the existing WebRTC config plugin. Sign in on two devices with separate Eventis accounts, open their direct chat, start a voice or video call, answer on the other device, then verify mute, camera toggle, decline, and hang up. Use Wi-Fi or mobile data on both devices; no SIM voice minutes are used.

Incoming call alerts currently require the recipient app to be running with an authenticated Socket.IO connection. Background and terminated-app call alerts need push delivery and native call UI integration.
