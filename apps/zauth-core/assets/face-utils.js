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

  /* ── Euclidean distance for fuzzy face matching ── */

  /**
   * Compute Euclidean distance between two Float32Array descriptors.
   * face-api.js uses L2 distance: same person < 0.6, different > 0.6.
   *
   * @param {Float32Array} a - first descriptor (128-dim)
   * @param {Float32Array} b - second descriptor (128-dim)
   * @returns {number} Euclidean distance
   */
  function euclideanDistance(a, b) {
    var sum = 0;
    for (var i = 0; i < a.length; i++) {
      var diff = a[i] - b[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  /* ── On-device biometric store (IndexedDB) ────── */
  //
  // Patent-aligned: biometric data stays on-device only.
  // We store the enrollment descriptor + hash in IndexedDB so that
  // during login, the client can:
  //   1. Capture a new face and match it against the enrolled descriptor
  //      using Euclidean distance (fuzzy matching, threshold 0.6)
  //   2. If matched, use the ORIGINAL enrollment hash as the ZK preimage
  //      so Poseidon(preimage) matches the stored server-side commitment
  // Raw embeddings NEVER leave the device.

  var DB_NAME = "zauth_biometric";
  var DB_VERSION = 1;
  var STORE_NAME = "enrollments";

  function openBiometricDB() {
    return new Promise(function (resolve, reject) {
      var request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function (event) {
        var db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "username" });
        }
      };
      request.onsuccess = function (event) {
        resolve(event.target.result);
      };
      request.onerror = function () {
        reject(new Error("Failed to open biometric IndexedDB"));
      };
    });
  }

  /**
   * Store enrollment biometric on-device after successful enrollment.
   * Stores: descriptor (Float32Array as base64), quantized hash, username.
   * This data NEVER leaves the device — it's used only for client-side
   * face matching on subsequent logins.
   *
   * @param {string} username
   * @param {Float32Array} descriptor - raw 128-dim face descriptor
   * @param {string} biometricHash - SHA-256 hex of quantized embedding
   */
  function storeEnrollmentBiometric(username, descriptor, biometricHash) {
    return openBiometricDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_NAME, "readwrite");
        var store = tx.objectStore(STORE_NAME);
        store.put({
          username: username,
          descriptor: float32ToBase64(descriptor),
          biometricHash: biometricHash,
          enrolledAt: Date.now()
        });
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(new Error("Failed to store enrollment")); };
      });
    });
  }

  /**
   * Retrieve enrollment biometric for client-side matching.
   * Returns null if no enrollment exists for this username.
   *
   * @param {string} username
   * @returns {Promise<{descriptor: Float32Array, biometricHash: string}|null>}
   */
  function getEnrollmentBiometric(username) {
    return openBiometricDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_NAME, "readonly");
        var store = tx.objectStore(STORE_NAME);
        var request = store.get(username);
        request.onsuccess = function () {
          var record = request.result;
          if (!record) {
            resolve(null);
            return;
          }
          // Decode base64 back to Float32Array
          var binary = atob(record.descriptor);
          var bytes = new Uint8Array(binary.length);
          for (var i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          resolve({
            descriptor: new Float32Array(bytes.buffer),
            biometricHash: record.biometricHash
          });
        };
        request.onerror = function () { reject(new Error("Failed to read enrollment")); };
      });
    });
  }

  /**
   * Match a live face descriptor against the enrolled descriptor.
   * Uses Euclidean distance — face-api.js threshold: same person < 0.6.
   *
   * @param {Float32Array} liveDescriptor - fresh capture from camera
   * @param {Float32Array} enrolledDescriptor - stored from enrollment
   * @param {number} [threshold=0.6] - max distance to consider same person
   * @returns {{matched: boolean, distance: number}}
   */
  function matchDescriptors(liveDescriptor, enrolledDescriptor, threshold) {
    threshold = threshold || 0.6;
    var dist = euclideanDistance(liveDescriptor, enrolledDescriptor);
    return {
      matched: dist < threshold,
      distance: dist
    };
  }

  /* ── Public API ─────────────────────────────────── */

  window.ZAuthFace = {
    float32ToBase64: float32ToBase64,
    quantizeEmbedding: quantizeEmbedding,
    uint8ToBase64: uint8ToBase64,
    hashEmbedding: hashEmbedding,
    computeBiometricHash: computeBiometricHash,
    sha256Hex: sha256Hex,
    euclideanDistance: euclideanDistance,
    matchDescriptors: matchDescriptors,
    storeEnrollmentBiometric: storeEnrollmentBiometric,
    getEnrollmentBiometric: getEnrollmentBiometric,
    loadFaceApiModels: loadFaceApiModels,
    extractFaceEmbedding: extractFaceEmbedding,
    startCameraStream: startCameraStream,
    stopCameraStream: stopCameraStream,
    showSuccessOverlay: showSuccessOverlay,
    showFailureOverlay: showFailureOverlay,
  };
})();
