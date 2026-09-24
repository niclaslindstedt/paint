// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE WHOLE APP: a WebView over the bundled web build, and nothing else.
//
// This is a deliberately thin wrapper. It starts a loopback server, points a
// WebView at it, keeps the native chrome in step with the page's theme, sends
// off-origin links to the system browser, answers the page when it asks to
// read or write the app's iCloud Drive container, and opens a provider's
// sign-in in an authentication session when the page asks for one. There is
// no native UI at all beyond a spinner and a failure screen — everything a reader sees is the web
// app, unchanged.
//
// The wrapper adds exactly one thing the browser cannot do, and it has to add
// something: App Store guideline 4.2 rejects a build that is only a viewer for
// a website. That one thing is iCLOUD SYNC — the sketchbook following the
// reader between their own devices with no account to create, no OAuth consent
// and no third party holding the file. It is offered from the OUTSIDE: the
// page is served unchanged and looks for a capability rather than for this
// wrapper, so a browser (which has none) simply does not list the backend. The
// app never asks what it is running inside. See `native/README.md`.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  WebView,
  type WebViewMessageEvent,
  type WebViewNavigation,
} from "react-native-webview";

import {
  FALLBACK_BACKGROUND,
  FALLBACK_FOREGROUND,
  REMOTE_URL,
} from "./src/config";
import { startLocalServer, type LocalServer } from "./src/local-server";
import {
  AFTER_LOAD_SCRIPT,
  BEFORE_LOAD_SCRIPT,
  isReport,
} from "./src/injected";
import {
  ICLOUD_SCRIPT,
  isICloudRequest,
  resolveScript,
  type ICloudMethod,
} from "./src/icloudBridge";
import { answerICloud } from "./src/icloud";
import {
  authSessionResolveScript,
  authSessionScript,
  isAuthSessionRequest,
} from "./src/authSessionBridge";
import { answerAuthSession, authRedirectUri } from "./src/authSession";

// Hold the native splash until the WebView actually paints. Called at module
// scope so the auto-hide never wins the race; a rejection only means the
// splash was already gone, which is harmless.
void SplashScreen.preventAutoHideAsync().catch(() => {});

// The redirect URI a sign-in comes back on (`<scheme>://oauth`, the scheme
// being the bundle id), and the provider the page finds it through. Null in a
// build with no URL scheme, which offers no provider and leaves the page on
// its redirect flow.
const AUTH_REDIRECT_URI = authRedirectUri();
const AUTH_SESSION_SCRIPT = AUTH_REDIRECT_URI
  ? authSessionScript(AUTH_REDIRECT_URI)
  : "";

// Ceiling on how long the splash may stay up. The happy path hides it on first
// paint; this only fires when a load hangs, so a broken start falls through to
// the spinner or the failure screen instead of stranding the reader on a
// splash forever.
const SPLASH_TIMEOUT_MS = 10_000;

type ServerState =
  | { status: "starting" }
  | { status: "ready"; origin: string }
  | { status: "failed"; error: Error };

export default function App() {
  const [server, setServer] = useState<ServerState>(
    REMOTE_URL
      ? { status: "ready", origin: REMOTE_URL }
      : { status: "starting" },
  );
  const [background, setBackground] = useState(FALLBACK_BACKGROUND);
  const webViewRef = useRef<WebView>(null);
  const canGoBack = useRef(false);
  const serverRef = useRef<LocalServer | null>(null);

  // --- the embedded server --------------------------------------------------

  const start = useCallback(async () => {
    if (REMOTE_URL) return;
    setServer({ status: "starting" });
    try {
      const running = await startLocalServer();
      serverRef.current = running;
      setServer({ status: "ready", origin: running.origin });
    } catch (error) {
      setServer({
        status: "failed",
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }, []);

  useEffect(() => {
    void start();
    return () => {
      void serverRef.current?.stop();
    };
  }, [start]);

  // --- the splash -----------------------------------------------------------

  const splashHidden = useRef(false);
  const hideSplash = useCallback(() => {
    if (splashHidden.current) return;
    splashHidden.current = true;
    void SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(hideSplash, SPLASH_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [hideSplash]);

  // A failed start has no WebView to paint, so drop the splash onto the
  // failure screen (and its Try again) rather than holding it.
  useEffect(() => {
    if (server.status === "failed") hideSplash();
  }, [server.status, hideSplash]);

  // --- the page's messages --------------------------------------------------

  // One inbound file operation. Kept off the render path — a coordinated read
  // waits for iCloud to fetch the bytes — and deliberately NOT cached: what
  // comes back goes straight into the page, which is where the document lives.
  // The wrapper holds no copy of anybody's drawings.
  const answer = useCallback(
    async (id: string, method: ICloudMethod, args: readonly string[]) => {
      const result = await answerICloud(method, args);
      webViewRef.current?.injectJavaScript(resolveScript(id, result));
    },
    [],
  );

  // One sign-in. The sheet is modal and the page waits on it; what comes back
  // is the provider's redirect URL, handed straight to the page, which holds
  // the PKCE verifier and makes the token exchange itself.
  const signIn = useCallback(async (id: string, url: string) => {
    if (!AUTH_REDIRECT_URI) return;
    const result = await answerAuthSession(url, AUTH_REDIRECT_URI);
    webViewRef.current?.injectJavaScript(authSessionResolveScript(id, result));
  }, []);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(event.nativeEvent.data) as unknown;
      } catch {
        return; // not ours — the page may postMessage whatever it likes
      }

      if (isICloudRequest(parsed)) {
        void answer(parsed.id, parsed.method, parsed.args);
        return;
      }
      if (isAuthSessionRequest(parsed)) {
        void signIn(parsed.id, parsed.url);
        return;
      }
      if (!isReport(parsed)) return;

      // The native chrome follows the page's theme so the status bar and the
      // safe-area bands match it instead of guessing.
      const reported = parsed.theme?.background;
      if (typeof reported === "string" && reported.trim() !== "") {
        setBackground(reported.trim());
      }
    },
    [answer, signIn],
  );

  // --- navigation -----------------------------------------------------------

  // The app opens documents of its own (the privacy policy, linked from
  // Settings), so the wrapper has to provide the "back" the browser chrome
  // would. Android routes the hardware button; iOS gets the edge swipe below.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!canGoBack.current) return false; // fall through: exit the app
      webViewRef.current?.goBack();
      return true;
    });
    return () => sub.remove();
  }, []);

  const origin = server.status === "ready" ? server.origin : null;

  // Keep the WebView on the embedded app. Anything else — a link in the
  // changelog — belongs in the system browser, because App Review expects
  // external links to open externally. A provider's sign-in page is not
  // navigated to at all: the page asks for an authentication session instead
  // (see `src/authSessionBridge.ts`), since a consent page in Safari redirects
  // back to Safari, not to the app. This stays the fallback for a page that
  // finds no session provider.
  const onShouldStartLoadWithRequest = useCallback(
    (request: WebViewNavigation) => {
      if (!origin) return false;
      if (request.url.startsWith(origin)) return true;
      if (request.url.startsWith("about:")) return true;
      void Linking.openURL(request.url);
      return false;
    },
    [origin],
  );

  if (server.status === "failed") {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.center}>
          <StatusBar style="auto" />
          <Text style={styles.errorTitle}>Could not start Paint</Text>
          <Text style={styles.errorBody}>{server.error.message}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void start()}
            style={({ pressed }) => [
              styles.retryButton,
              pressed && styles.retryButtonPressed,
            ]}
          >
            <Text style={styles.retryLabel}>Try again</Text>
          </Pressable>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView
        style={[styles.fill, { backgroundColor: background }]}
        edges={["top", "bottom"]}
      >
        {/* `auto` picks the bar style from the background behind it, which is
            exactly the page's own theme once it has reported one — and that
            background is the SafeAreaView above, which the page's theme
            paints. */}
        <StatusBar style="auto" />
        {origin ? (
          <WebView
            ref={webViewRef}
            source={{ uri: origin }}
            style={[styles.fill, { backgroundColor: background }]}
            javaScriptEnabled
            // Android: without this `localStorage` is unavailable, and the
            // app keeps its settings and storage choice there.
            domStorageEnabled
            // Never set `incognito` — it makes WKWebView storage
            // non-persistent, which would drop every drawing on exit.
            incognito={false}
            allowsBackForwardNavigationGestures
            setSupportMultipleWindows={false}
            injectedJavaScriptBeforeContentLoaded={BEFORE_LOAD_SCRIPT}
            // Three scripts, one prop: the theme reporter the native chrome
            // follows, the iCloud provider the app looks for, and the
            // auth-session provider its Dropbox sign-in looks for. All run
            // once the page has loaded, and all are guarded against a second
            // injection (a reload re-runs this).
            injectedJavaScript={`${AFTER_LOAD_SCRIPT}\n${ICLOUD_SCRIPT}\n${AUTH_SESSION_SCRIPT}`}
            onMessage={onMessage}
            onLoadEnd={hideSplash}
            onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
            onNavigationStateChange={(nav) => {
              canGoBack.current = nav.canGoBack;
            }}
            // The app draws its own scroll surfaces and pins its own chrome;
            // bouncing the WebView itself just exposes the native background
            // behind the layout.
            bounces={false}
            overScrollMode="never"
          />
        ) : (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: FALLBACK_BACKGROUND },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: FALLBACK_BACKGROUND,
    padding: 24,
  },
  errorTitle: {
    color: FALLBACK_FOREGROUND,
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
    textAlign: "center",
  },
  errorBody: { color: "#8b949e", fontSize: 14, textAlign: "center" },
  retryButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#1c2128",
  },
  retryButtonPressed: { backgroundColor: "#262c34" },
  retryLabel: { color: FALLBACK_FOREGROUND, fontSize: 15, fontWeight: "600" },
});
