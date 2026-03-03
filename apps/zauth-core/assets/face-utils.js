/**
 * ZAuthFace — shared face-verification utilities.
 * Loaded once via <script src="/ui/assets/face-utils.js"></script>
 * before each page's inline <script>.
 */
(function () {
  "use strict";

  var modelsLoaded = false;
  var MODEL_URL =
    "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model/";

  /* ── Encoding helpers ───────────────────────────── */

  function float32ToBase64(descriptor) {
    var float32 =
      descriptor instanceof Float32Array
        ? descriptor
        : new Float32Array(descriptor);
    var bytes = new Uint8Array(float32.buffer);
    var binary = "";
    for (var i = 0; i < bytes.length; i++)
      binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function quantizeEmbedding(descriptor) {
    var quantized = new Uint8Array(128);
    for (var i = 0; i < 128; i++) {
      var val = Math.round(descriptor[i] * 128 + 128);
      quantized[i] = Math.max(0, Math.min(255, val));
    }
    return quantized;
  }

  function uint8ToBase64(uint8Array) {
    var binary = "";
    for (var i = 0; i < uint8Array.byteLength; i++)
      binary += String.fromCharCode(uint8Array[i]);
    return btoa(binary);
  }

  function hashEmbedding(quantizedBytes) {
    return crypto.subtle
      .digest("SHA-256", quantizedBytes.buffer)
      .then(function (digest) {
        var bytes = Array.from(new Uint8Array(digest));
        return bytes
          .map(function (b) {
            return b.toString(16).padStart(2, "0");
          })
          .join("");
      });
  }

  function sha256Hex(input) {
    var data;
    if (typeof input === "string") {
      data = new TextEncoder().encode(input);
    } else {
      data = input; // ArrayBuffer, Uint8Array, or any BufferSource
    }
    return crypto.subtle.digest("SHA-256", data).then(function (digest) {
      var bytes = Array.from(new Uint8Array(digest));
      return bytes
        .map(function (b) {
          return b.toString(16).padStart(2, "0");
        })
        .join("");
    });
  }

  /* ── face-api.js model loading ──────────────────── */

  function loadFaceApiModels() {
    if (modelsLoaded) return Promise.resolve();
    if (!window.faceapi) return Promise.reject(new Error("face-api.js not loaded"));
    return Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]).then(function () {
      modelsLoaded = true;
    });
  }

  /* ── Face embedding extraction ──────────────────── */

  function extractFaceEmbedding(videoElement) {
    return loadFaceApiModels().then(function () {
      return faceapi
        .detectSingleFace(videoElement)
        .withFaceLandmarks()
        .withFaceDescriptor();
    }).then(function (detection) {
      if (!detection) throw new Error("No face detected");
      return detection.descriptor;
    });
  }

  /* ── Camera helpers ─────────────────────────────── */

  function startCameraStream(videoElement, opts) {
    opts = opts || {};
    var constraints = {
      video: {
        facingMode: opts.facingMode || "user",
        width: opts.width || 640,
        height: opts.height || 480,
      },
      audio: false,
    };
    return navigator.mediaDevices
      .getUserMedia(constraints)
      .then(function (stream) {
        videoElement.srcObject = stream;
        return stream;
      });
  }

  function stopCameraStream(stream) {
    if (stream) {
      stream.getTracks().forEach(function (track) {
        track.stop();
      });
    }
  }

  /* ── Viewport overlays ─────────────────────────── */

  function showSuccessOverlay(viewportId) {
    var viewport = document.getElementById(viewportId);
    if (!viewport) return;
    viewport.classList.add("completing");
    var el = viewport.querySelector(".face-success");
    if (!el) return;
    el.style.display = "none";
    void el.offsetWidth;
    el.style.display = "flex";
    setTimeout(function () {
      el.style.display = "none";
    }, 700);
  }

  function showFailureOverlay(viewportId) {
    var viewport = document.getElementById(viewportId);
    if (!viewport) return;
    viewport.classList.add("failed");
    var el = viewport.querySelector(".face-failure");
    if (!el) return;
    el.style.display = "none";
    void el.offsetWidth;
    el.style.display = "flex";
    setTimeout(function () {
      el.style.display = "none";
      viewport.classList.remove("failed");
    }, 700);
  }

  /* ── Privacy-preserving biometric commitment ───── */

  /**
   * Compute an irreversible biometric commitment from a face descriptor.
   * This is the ONLY representation sent to the server — raw embeddings
   * NEVER leave the device. The commitment is SHA-256(quantized_embedding),
   * which cannot be reversed to reconstruct facial features.
   *
   * @param {Float32Array} descriptor - 128-dim face descriptor from face-api.js
   * @returns {Promise<string>} 64-char hex SHA-256 hash
   */
  function computeBiometricHash(descriptor) {
    var quantized = quantizeEmbedding(descriptor);
    return hashEmbedding(quantized);
  }

  /* ── Public API ─────────────────────────────────── */

  window.ZAuthFace = {
    float32ToBase64: float32ToBase64,
    quantizeEmbedding: quantizeEmbedding,
    uint8ToBase64: uint8ToBase64,
    hashEmbedding: hashEmbedding,
    computeBiometricHash: computeBiometricHash,
    sha256Hex: sha256Hex,
    loadFaceApiModels: loadFaceApiModels,
    extractFaceEmbedding: extractFaceEmbedding,
    startCameraStream: startCameraStream,
    stopCameraStream: stopCameraStream,
    showSuccessOverlay: showSuccessOverlay,
    showFailureOverlay: showFailureOverlay,
  };
})();
