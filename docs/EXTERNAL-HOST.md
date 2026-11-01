# External host compatibility preview

This branch adds a session backend beneath Orbit’s voice tools. Orbit still owns the realtime audio connection, provider credentials, microphone controls, consent checks and moving native character. The selected host owns sessions and execution. No audio is sent over the host protocol.

The first target is **Windows x64**. The [companion preview package](https://github.com/JustSuperHuman/orbit-voice/releases/tag/bro-preview-v1.3.0.1) includes the tested application and Electron runtime. Extract it and run `install-bro-preview.ps1`, then enable Orbit Voice in Bro settings. The script installs a versioned copy under your local Programs folder and registers its paths. The original Orbit beta download uses a separate connection.

## Source and isolation

- Fork: https://github.com/JustSuperHuman/orbit-voice
- Original project: https://github.com/Cookiebubba/orbit-voice
- Inspected upstream revision: `f65f437d8df7b5a5b976da6b7bbd79476ebd7232`
- Branch: `feat/external-host-compatibility`
- Preview version: `1.3.0-bro-preview.1`
- Electron app ID: `dev.justsuperhuman.orbit.bro-preview`
- Windows profile: `%APPDATA%/OrbitBroPreview`
- Managed UI bridge port: assigned automatically on IPv4 loopback; standalone previews use `4327` or an explicit development `PORT`

The preview does not copy upstream settings or secrets, persist a shared environment key into its profile, replace an upstream installation, change startup-at-login, terminate another Orbit, or automatically relaunch after quit. The explicitly paired bro preview can resolve the existing system OpenAI key natively, as described below; other environment settings are not broadly imported. It has its own single-instance lock. A conservative check refuses startup if the standard standalone Orbit port (`4317`) is already occupied; a nonstandard standalone port cannot be discovered this way. Close a conflicting runtime yourself before starting this one.

Electron’s update client is disabled, including manual checks. Its packaging publisher points at the fork rather than upstream. Native Swift packaging has a separate bundle/profile/Keychain identity and fork feed, with preview-version updates disabled. Neither is an approved release channel.

MIT attribution, `LICENSE` and `THIRD_PARTY_NOTICES.md` are retained.

## Build and launch

Review the package scripts before installing dependencies. From the source checkout:

```powershell
npm ci --ignore-scripts --no-audit --no-fund
npm --prefix ui ci --ignore-scripts --no-audit --no-fund
npm --prefix ui run build
npm run compatibility:manifest
```

Electron 44 uses a separate binary installer when the runtime has not been downloaded. Review `node_modules/electron/install.js`, then run `node node_modules/electron/install.js` if needed. That installs the runtime; it does not start the microphone. Native speech-model downloads are not needed for OpenAI or Grok realtime.

Launch the native preview with the **descriptor path**, never its token:

```powershell
& "F:/orbit-voice-bro/node_modules/electron/dist/electron.exe" "F:/orbit-voice-bro" --external-host-file "<BRO_DIR>/orbit/connection.json" --open-settings
```

For bro’s local configuration, the executable is the absolute Electron binary path and `application_dir` is `F:/orbit-voice-bro`. The descriptor must already exist and belong to the current user. A development launch can instead use `ORBIT_EXTERNAL_HOST_FILE`; packaged launches require the flag. `--open-settings` also works on a second launch, without creating another voice runtime or silently changing the running app’s pairing. Re-pair a running preview by quitting it and launching it with the new descriptor.

A source-only test profile override is `ORBIT_BRO_PREVIEW_USER_DATA`. The upstream `ORBIT_USER_DATA` variable is deliberately not imported by this preview.

In Settings, explicitly choose **OpenAI realtime** or **Grok** for the selected workspace. OpenAI has three source policies: **Saved key**, **System key**, and **Saved or system**. The paired bro preview defaults to saved-or-system; standalone keeps saved-only. A valid separately saved key wins in saved-or-system mode. If its store cannot be read/decrypted, that mode reports an error rather than silently changing billing accounts.

The native system resolver reads only `OPENAI_API_KEY`, in process → Windows user → Windows machine order. Refresh is asynchronous, bounded and deduplicated; config reads use cached metadata. A valid inherited process key still wins after a registry refresh. System keys remain in native/server memory: they are never copied into settings, `openai-key.bin`, host descriptors, URLs, arguments, logs or the renderer. No project `.env`, upstream profile or ChatGPT/OAuth credential is searched.

A separate saved key is encrypted with Windows DPAPI in `openai-key.bin`, independently of xAI and Anthropic stores. The UI distinguishes saved presence, system availability and effective source without receiving a saved/system key. Removing a saved key changes only that encrypted store, never the OS environment. Each conversation captures one credential; source changes apply to later conversations, and authentication failures do not try another account automatically. Selecting, saving or refreshing a source does not start the microphone, run a paid preview or authorize work.

New standalone installs still default to Claude voice; existing standalone Grok choices are not migrated. A selected external workspace requires realtime conversation and refuses the local Claude speech path until the user chooses a realtime provider. It never silently falls back to record/transcribe/playback.

Model and OpenAI voice changes take effect on the next conversation. The microphone, wake word and global hotkey start off in the isolated preview. Enable a wake shortcut explicitly in Settings if wanted; setting or enabling it does not start recording. Start speech with Orbit’s talk control or an explicitly enabled hotkey only after microphone/provider access has been approved.

## Native client API

`src/external-host.js` exports:

- `descriptorPath(argv, env)` and `readDescriptor(path)` for native startup.
- `createExternalHost({descriptor, onSnapshot, onResult, onStage})`.
- `selectExternalHost(client)` / `externalHost()` as the optional selected-backend seam.
- Client methods `start`, `stop`, `snapshot`, `has`, `beginUtterance`, `submit`, `observe`, `focus`, `cancel`, `onResult`, `onProgress`, `results`, and the native-only `stage` snapshot.

Selecting a host changes `createToolRunner` and `toolDefs` in `src/tools.js`; it is not an unused parallel module. Claude-only controls, generic app automation, permission answers, session creation and raw terminal operations are not advertised for this protocol. A disconnected selected host remains selected and fails closed rather than falling back to Claude Desktop automation.

### Protocol v1

The descriptor is:

```json
{"protocol":1,"instanceId":"uuid","url":"http://127.0.0.1:port","token":"random-secret"}
```

Native startup checks local absolute paths, rejects symlinks and oversized descriptors, and checks the current-user ACL on Windows or owner/mode `0600` on Unix. Bearer credentials remain in the native client closure. They never enter renderer state, URLs, logs or command-line arguments. Redirects are rejected; requests go only to the descriptor’s exact IPv4 loopback origin, without a browser Origin. Response sizes, request counts and result retention are bounded.

All routes are under `/orbit/v1`:

| Method | Route | Payload / purpose |
| --- | --- | --- |
| GET | `/host` | Protocol, capabilities, instance identity and bounded session/window snapshot |
| POST | `/utterances` | `{id}` at recording or speech onset; returns the pinned session/generation |
| POST | `/requests` | `{id,utteranceId,text}` for approved work |
| GET | `/requests/:id` | Correlated state, progress, initial reply and accepted-task outcome |
| POST | `/requests/:id/cancel` | Cancel one known request only |
| POST | `/focus` | `{sessionId}` using an advertised stable ID |
| GET | `/events?after=<sequence>` | Ordered bounded hints and cursor; gaps refresh snapshots |
| GET | `/stage?after=<revision>` | Optional `avatar.stage.v1` latest-only geometry watch, independent of control and voice |

The required execution/read capabilities are `sessions.read`, `orchestrator.submit` and `requests.observe`. `sessions.focus`, `requests.cancel-queued`, `avatar.desktop` and `avatar.attached` are negotiated separately. There are no additional invented administration or permission-answer routes.

The host snapshot’s native identity is `window:{handle:string,pid:number}` or null. Its focused session is `focusedSessionId`; each session has a stable `id` and opaque `generation`. Titles are labels, never authority.

### Input, consent and delivery

The renderer emits a random utterance ID **before recording starts**, and before forwarding audio at each subsequent local speech onset. The native process latches it through `POST /utterances`; provider speech/item and response IDs retain that capture identity. A late transcript or tool call does not obtain a new target. Tool execution waits for the corresponding real transcript and uses that response’s captured utterance, not whatever the user happens to be saying later.

Drafts stay local. Their words must come from the real captured user input. Sending requires a fresh clear yes after the draft, or an explicit send instruction in the same utterance. The request UUID is allocated once with the draft. A later confirmation does not replace its target. An unknown transport outcome is observed with GET, never automatically replayed; reusing an ID with changed content is rejected.

`received` is transport receipt. Only `queued` or later confirmed states count as durable acceptance. Acceptance is not completion. Supported states are `received`, `queued`, `dispatched`, `completed`, `failed`, `cancelled` and `uncertain`.

The client polls host/request snapshots and consumes event cursors. State, progress and result events are hints; correlated GET snapshots remain authoritative. An initial `result:{text,ok}` and a later `outcome:{text,ok}` are distinct. Outcomes do not reopen state or replace the coordinator’s initial reply. Distinct outcome texts are hash-deduplicated and bounded per request.

Progress is displayed as a note. Results enter the realtime conversation as correlated **function-call outputs**, explicitly labeled non-user data. They never go through `ui.text`, authorize a send, answer a permission prompt or start new work. Notifications invalidate ambiguous prior consent. Stop speaking, cancel a queued request and interrupt a session remain separate operations; the protocol does not expose session interruption.

Request/cursor retention survives transport and voice-call reconnects within this preview process. It is not an on-disk journal of Orbit’s own state. Restarting Orbit does not rediscover every outstanding request, replay work or promise delivery of an old spoken answer; the host’s durable inbox remains authoritative.

## OpenAI realtime provider

`src/openai-realtime.js` adapts OpenAI’s GA Realtime WebSocket to Orbit’s existing normalized voice runtime:

- `wss://api.openai.com/v1/realtime?model=gpt-realtime` (or the explicitly selected `gpt-realtime-mini`).
- Native Bearer authentication; no API key in a URL or renderer socket.
- `session.update` with `type:"realtime"`, nested 24 kHz PCM audio configuration and function tools.
- Continuous audio input/output, server VAD and interruption, streaming transcripts, live function outputs and `response.create` continuation.
- Playback-clock-based `conversation.item.truncate` on barge-in, with late output and tool calls from an interrupted response suppressed.
- Provider-native session metadata and error details are not forwarded to the renderer.

Protocol evidence comes from OpenAI’s maintained SDK sources, inspected during implementation:

- https://github.com/openai/openai-node/blob/master/src/realtime/internal-base.ts
- https://github.com/openai/openai-node/blob/master/src/resources/realtime/realtime.ts
- https://github.com/openai/openai-node/blob/master/src/realtime/websocket.ts

Those sources document the GA Realtime dialect, not the legacy bro `gpt-live-1` / `/v1/live/sessions` delegation dialect. This preview does not invent compatibility with that undocumented endpoint. No live account/model-access or paid voice test has been run.

## The real character

Settings offers **Desktop** and **Stay with bro**. Both reuse `electron/avatar.js`, `electron/avatar-host.js` and the original Qubit/Buddy engine, director, pickup/drag/throw physics, transparent click-through and voice-state/emote runtime. No replacement sprite, static child webview or development-only free-avatar flag is used for the integration.

Qubit's adjacent mic control follows the audio owner's capture and input gate: off, connecting, listening, muted, or speaking with the mic on/off. Start wakes or unmutes the existing conversation; Stop hangs up and releases the microphone. Missing provider setup opens settings. Single-click keeps the original wake behavior, right-click keeps the orb's sleep/wake action, and double-click opens settings without also starting voice. Dragging remains available with reduced motion; release drops him without an inertial throw. Only the body and the visible control receive mouse input.

The selected host may publish `mode:"desktop"` or `mode:"attached"`. Orbit applies the initial host mode only after config and native shell initialization, then reacts to subsequent host-mode changes through the existing character/settings transition. While a valid mode is published, bro owns that preference: Orbit reflects it and directs placement changes back to bro rather than offering a competing local toggle. Missing or invalid modes retain local controls. Unchanged modes do not repeat the character transition. Standalone Orbit does not participate in this synchronization.

Desktop uses Orbit’s existing bounded screen strip; it is not unrestricted desktop roaming. Attached mode uses the existing native focus/window watcher. The HWND must resolve to the advertised PID before a guest is created. PID-bearing move events hide the guest on handle reuse. Minimize, cloak, geometry and negative-coordinate placement pass through the existing native host. Host closure/disconnect removes attached guests, and stale async validation cannot recreate them.

### Optional client-area stage

Hosts advertising `avatar.stage.v1` can supply schema-1 workspace geometry through one independent, abortable long poll. The ordinary 750 ms control/request poll and realtime audio are unchanged. Heartbeats renew a two-second freshness lease without rebuilding geometry. Bad, unavailable, expired or disconnected stage data clears collision geometry and hides the attached Qubit; it never disconnects a voice call or discards known requests. Older hosts keep their existing window-only attachment.

A stage response is `{schema:1,instanceId,revision,available,frame}`. Its frame contains `window:{handle,pid,epoch}`, `viewport:{width,height,scaleFactor,physicalOrigin:{x,y}}`, `suspended`, `surfaces:[{id,kind,rect:{x,y,w,h}}]`, `exclusions` and optional `preferredSurfaceId`. The client independently validates the 64 KiB response limit, finite client-local bounds, 96-surface/32-exclusion limits, unique safe IDs and surface kinds. It also binds HWND/PID and the host's optional window epoch. No session text or authority travels in geometry.

The native helper now reports physical **client** bounds and DPI, not a guessed title-bar inset. Cached describe/watch data validates viewport dimensions and scale. Ordinary native window motion translates local geometry; resize/DPI mismatches suspend it until a matching fresh frame arrives. The persistent overlay is clipped to the client and a monitor's usable work area, with no fallback onto unrelated desktop space. It does not use the 12-second temporary drag/throw lift lease. Existing click-through, host z-order and minimize/cloak behavior remain in use.

This first stage implementation supports **Qubit only**, using the original engine, navigation and throw controller. The same surface list drives navigation, idle perches and collisions; headers remain thin surfaces rather than box-to-floor columns. Stable IDs carry a resting foot with a moved support, and removed supports release it naturally. Manual pickup/flight keeps control until landing. Workspace throws substep fast motion against thin surfaces using actual rotated/grown/squashed extents. An optional workspace-only support tolerance keeps closely stacked pane bottoms and headers distinct, instead of pulling a resting or descending body onto a nearby ledge above it. Standalone throw timing and support tolerances are unchanged. Other selected avatars keep their honest old strip behavior; the integration never switches the selected character automatically.

Exclusions currently **suspend Qubit altogether**. This deliberately avoids claiming no-occupancy routing around child webviews or unsupported modal regions.

### Optional Automatic movement

A host can advertise optional `avatar.roam.v1` and publish `avatarRoam:{schema:1,policy:"auto"}`. Protocol-v1 `mode` remains `desktop` or `attached` for older peers; a supported Auto policy takes precedence. The host owns the requested policy, not the character's transient position. This is optional capability advertisement, not a bilateral handshake or a guarantee about an older already-running process.

For Qubit, Automatic keeps one persistent native character/controller in one display's full work area. Bro's fresh surfaces are translated into that world alongside a desktop floor. Dragging can continue outside bro and back before release; walking and swept throws cross its edge where a real route exists. Crossings do not toggle saved placement, recreate an engine, restart voice, renew a temporary lift indefinitely or send a desktop landing back to the old strip. A real divider or an unreachable jump remains a real obstacle.

The selected display stays with the character even if bro moves elsewhere. The full body remains inside that work area. Continuous cross-display drag/flight, mirrored renderers and arbitrary other-window obstacles are not part of this increment. Display loss or invalid DPI cancels the active interaction and safely recovers the same runtime; it is not seamless trajectory preservation.

The owner persists independently of bro's optional collision region. Stale, covered, minimized, excluded or mismatched bro geometry cannot accept entry or provide support, but does not destroy an outside desktop character. Reappearing geometry does not force a detached body home. Native movement/hit/gesture frames are revisioned, and late reports are ignored. Active-only read-only cursor/button tracking reconciles lost capture/release; cancellation/fallback never counts as a click-to-talk or work consent. Fixed Desktop/Attached and other selected avatars keep their prior behavior.

### Isolated stage acceptance seam

`npm run e2e:avatar-stage` runs the actual external-host client, native avatar module and built Qubit renderer against fixture host/native geometry. It imports no voice runtime, settings/credential store, provider or microphone code. Its windows stay hidden; captures come only from its own Electron compositor. A fresh temporary Electron profile is used unless `ORBIT_BRO_PREVIEW_USER_DATA` explicitly supplies a test profile.

For a separately launched isolated real bro GUI, use its protected descriptor and explicitly confirm its process ID:

```powershell
& "F:/orbit-voice-bro/node_modules/electron/dist/electron.exe" "F:/orbit-voice-bro/scripts/avatar-stage-e2e.mjs" --host-file "<scratch BRO_DIR>/orbit/connection.json" --expected-host-pid <isolated GUI PID>
```

The supplied-host mode requires authenticated host name `bro`, the expected published PID, and native HWND/PID/client/DPI validation. The default is still hidden/compositor-only. Do not point it at a user-owned runtime. `--visible` is a separate opt-in for an isolated native overlay and uses inactive, nonfocusable windows; it is not needed for compositor checks. No command moves the OS pointer or sends OS input.

The harness waits for a stable physical-body contact with an advertised surface, drops the real body onto a chosen advertised header, asserts the settled support ID, and records multiple PNGs plus `captures.json` in the temporary output path printed at completion. The final fixture run passed 13 captures, including stable `pane-left` support despite a second one-way ledge 9 px above it, suspension, and capability-withdrawal fallback to the old strip without stale colliders. Per-frame state and final failure observations are saved even when an assertion fails. These are renderer/transport/binding checks, **not** Windows stacking, real pointer/click-through, mixed-DPI, virtual-desktop or monitor-removal acceptance. Those checks still require a separately authorized native run.

## Verification

```powershell
npm run test:compatibility
npm run test:sandboxed
npm run e2e:managed
npx --no-install electron scripts/avatar-auto-e2e.mjs
npx --no-install electron scripts/avatar-auto-e2e.mjs --interactions-only --reduced-motion
npm --prefix ui run build
npm run compatibility:manifest
git diff --check
```

`test:compatibility` passed 27 unit fixtures plus 3 actual Orbit HTTP/voice-socket runtime tests against in-memory host/provider fixtures. The focused Qubit/throw/transport/native-binding run passed 60 tests, including stage heartbeats/expiration, malformed geometry, epoch/DPI/client transforms, moving/deleted supports, multi-header navigation, one-way semantics and high-speed grown/rotated throws. It does not open a microphone or contact a real provider. The sandboxed Grok/Claude consent and wake suites also passed: 113 tests through the repository’s sandbox loader. The typed UI production build and `git diff --check` passed.

The Automatic/system-key follow-up passed 92 focused unit/engine/credential/realtime fixtures and the typed UI build. The full serial sandbox run passed 124 tests, including native credential metadata, source-change continuity and an active fake-provider socket surviving placement updates. A sandbox clipboard failure exposed a pre-existing isolation leak: direct tool tests could reach the real OS clipboard. The sandbox loader now uses an in-memory clipboard adapter with its own regression; production clipboard/consent logic is unchanged. The hidden Automatic renderer passed nine acceptance groups; a separate actual inactive bro host passed native owner/host-loss checks. Neither run establishes real desktop pointer/stacking acceptance.

The full upstream `npm test` also runs native Windows focus, input and Electron helper tests. The observed broad run had 437 passes, 6 skips and 4 failures: Claude executable lookup on this machine’s PATH, native focus restoration, Electron extraction while a DLL was in use, and a focus-borrowing helper unavailable in that run. These are not represented as passing acceptance. Do not rerun native desktop tests against unrelated live windows.

A separate coordinator run of the existing `avatar-free-e2e` harness passed its avatar visibility, geometry and avatar-kind switching checks. The overall harness still failed its no-child-process assertion: the fixture observed blocked `powershell.exe` and `claude.exe` attempts, plus an existing `brain.js` timer initialization error when process creation was blocked. This is a native harness limitation, not a complete acceptance pass. Standalone production defaults were not changed to silence the fixture. No microphone or paid provider test was performed.

The generated `orbit-bro-compatibility.json` covers SHA-256 hashes of every actual `package.json`, `electron/**`, `src/**` and built `public/**` file, plus source revision, preview identity, protocol range and capabilities. Regenerate it after every source/UI change. It describes this **source application directory**, not a signed packaged release. The generator refuses non-Windows-x64 compatibility claims until native parity exists.

## macOS and release limits

The native Swift engine’s standalone voice default remains unchanged. Its profile, bundle, Keychain and updater identity are isolated, but it does **not** implement the new OpenAI provider, descriptor/host tools or native bro attachment. No Swift build or macOS runtime acceptance was performed on Windows. Do not advertise macOS compatibility from this preview.

The compatibility preview is distributed separately from upstream Orbit. Hidden acceptance uses fake audio and provider connections. A real microphone, paid speech roundtrip and full spoken request → durable request → correlated spoken result remain outside those checks. Native stacking, mixed-DPI and virtual-desktop checks also require separate acceptance.
