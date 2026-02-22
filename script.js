(function bootstrap() {
  const loginBtn = document.getElementById("login-btn");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const processing = document.getElementById("processing");
  const statusText = document.getElementById("status-text");
  const subtitle = document.querySelector("#login-card .subtitle");
  const errorText = document.getElementById("error-text");
  const welcomeText = document.getElementById("welcome-text");
  const winMinimizeBtn = document.getElementById("win-minimize");
  const winMaximizeBtn = document.getElementById("win-maximize");
  const winCloseBtn = document.getElementById("win-close");

  let supabaseClient = null;
  let runtimeConfig = null;
  let successSequenceRunning = false;

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function setStatus(text) {
    statusText.textContent = text;
    subtitle.textContent = text;
  }

  function setError(message) {
    errorText.textContent = message || "";
    errorText.classList.toggle("visible", Boolean(message));
  }

  function setProcessing(isLoading) {
    processing.classList.toggle("visible", isLoading);
    processing.setAttribute("aria-hidden", String(!isLoading));
    loginBtn.disabled = isLoading;
  }

  function addRipple(event) {
    const rect = loginBtn.getBoundingClientRect();
    const ripple = document.createElement("span");
    const hasPointer = typeof event.clientX === "number";
    const x = hasPointer ? event.clientX - rect.left : rect.width / 2;
    const y = hasPointer ? event.clientY - rect.top : rect.height / 2;
    ripple.className = "ripple";
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    loginBtn.appendChild(ripple);
    ripple.addEventListener("animationend", () => ripple.remove());
  }

  function getUiErrorMessage(code) {
    const normalized = String(code || "").toLowerCase();
    switch (normalized) {
      case "invalid_credentials":
      case "invalid_login_credentials":
      case "email_not_confirmed":
      case "no_account":
      case "wrong_password":
        return "Invalid email or password";
      case "no_purchase_access":
      case "purchase_required":
      case "revoked":
      case "inactive":
        return "Purchase required";
      case "hwid_mismatch":
      case "wrong_hwid":
        return "Wrong HWID, contact support";
      case "no_hwid":
      case "missing_hwid":
        return "HWID error";
      default:
        return "Login failed";
    }
  }

  async function initSupabase() {
    runtimeConfig = await window.runtime.getConfig();
    if (!runtimeConfig.supabaseUrl || !runtimeConfig.supabaseAnonKey) {
      throw new Error(
        "Missing Supabase config. Set SUPABASE_URL and SUPABASE_ANON_KEY.",
      );
    }

    if (!window.supabase || !window.supabase.createClient) {
      throw new Error("Supabase client library failed to load.");
    }

    supabaseClient = window.supabase.createClient(
      runtimeConfig.supabaseUrl,
      runtimeConfig.supabaseAnonKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      },
    );
  }

  async function handleLogin(event) {
    addRipple(event);
    setError("");
    setProcessing(true);

    try {
      if (!supabaseClient) {
        await initSupabase();
      }

      const email = emailInput.value.trim();
      const password = passwordInput.value;
      if (!email || !password) {
        throw new Error("Enter email and password");
      }

      setStatus("Checking device...");
      const hwid = await window.device.getHWID();
      if (!hwid) {
        throw new Error("HWID error");
      }

      setStatus("Signing in...");
      const { data: authData, error: authError } =
        await supabaseClient.auth.signInWithPassword({
          email,
          password,
        });

      if (authError) {
        const uiError = getUiErrorMessage(
          authError.code || authError.name || "invalid_credentials",
        );
        throw new Error(uiError);
      }
      if (!authData?.user) {
        throw new Error("Login failed");
      }

      setStatus("Checking access...");
      let { data: accessData, error: accessError } = await supabaseClient.rpc(
        "authorize_app_access",
        {
          p_hwid: hwid,
        },
      );

      const fnMissingInCache =
        accessError &&
        String(accessError.message || "").includes(
          "Could not find the function public.authorize_app_access",
        );

      if (fnMissingInCache) {
        // If available, ask PostgREST to reload schema cache, then retry once.
        await supabaseClient.rpc("pg_notify", {
          channel: "pgrst",
          payload: "reload schema",
        });
        await delay(300);
        ({ data: accessData, error: accessError } = await supabaseClient.rpc(
          "authorize_app_access",
          { p_hwid: hwid },
        ));
      }

      if (accessError) {
        await supabaseClient.auth.signOut();
        throw new Error(accessError.message || "Access check failed");
      }
      if (!accessData || accessData.ok !== true) {
        await supabaseClient.auth.signOut();
        const uiError = getUiErrorMessage(
          accessData?.reason || accessData?.error || "purchase_required",
        );
        throw new Error(uiError);
      }

      setStatus("Welcome back");
      welcomeText.textContent = authData.user.email || "Welcome back";
      passwordInput.value = "";

      if (!successSequenceRunning) {
        successSequenceRunning = true;
        await delay(2000);
        document.body.classList.add("is-logged-in");
        await delay(5000);
        document.body.classList.add("is-closing-success");
        await delay(460);
        document.body.classList.remove("is-closing-success");
        document.body.classList.remove("is-logged-in");
        setStatus("Sign in to continue");
        successSequenceRunning = false;
      }
    } catch (error) {
      setStatus("Sign in to continue");
      setError(error.message || "Login failed.");
    } finally {
      setProcessing(false);
    }
  }

  loginBtn.addEventListener("click", handleLogin);
  passwordInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !loginBtn.disabled) {
      handleLogin(event);
    }
  });

  window.addEventListener("DOMContentLoaded", async () => {
    setStatus("Sign in to continue");
    try {
      await initSupabase();
    } catch (error) {
      setError(error.message);
    }
  });

  if (window.windowControls) {
    winMinimizeBtn?.addEventListener("click", () => {
      window.windowControls.minimize();
    });

    winMaximizeBtn?.addEventListener("click", async () => {
      const isMax = await window.windowControls.toggleMaximize();
      winMaximizeBtn.title = isMax ? "Restore" : "Maximize";
    });

    winCloseBtn?.addEventListener("click", () => {
      window.windowControls.close();
    });
  }
})();
