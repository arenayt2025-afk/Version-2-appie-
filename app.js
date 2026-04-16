// 🔥 Firebase config (APNA DALO)
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "apppoe-702a4.firebaseapp.com",
  databaseURL: "https://apppoe-702a4-default-rtdb.firebaseio.com", // 👈 ADD THIS
  projectId: "apppoe-702a4",
  storageBucket: "apppoe-702a4.firebasestorage.app",
  messagingSenderId: "685763814033",
  appId: "1:685763814033:web:f573e17b8125ba1bad5530",
  measurementId: "G-9G8M5W4WZ8"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let localStream;
let pc;
let roomId;
let role;
let userId = Math.random().toString(36).substr(2, 9);

const servers = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

function setStatus(s) {
  document.getElementById("status").innerText = s;
  console.log(s);
}

// CAMERA
async function init() {
  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
  });
  document.getElementById("localVideo").srcObject = localStream;
}
init();

// CLEAN
async function cleanAll() {
  if (roomId) {
    await db.ref("rooms/" + roomId).remove();
    await db.ref("calls/" + roomId).remove();
  }
  await db.ref("waiting/" + userId).remove();
}

// FIND MATCH
async function findMatch() {
  setStatus("Searching...");

  const waiting = await db.ref("waiting").once("value");

  if (waiting.exists()) {
    const other = Object.keys(waiting.val())[0];

    if (other !== userId) {
      await db.ref("waiting/" + other).remove();

      roomId = "room_" + Date.now();
      role = "caller";

      await db.ref("rooms/" + roomId).set({
        caller: userId,
        callee: other
      });

      startCall();
      return;
    }
  }

  // wait
  await db.ref("waiting/" + userId).set(true);

  db.ref("rooms").on("child_added", (snap) => {
    const room = snap.val();

    if (room.callee === userId) {
      roomId = snap.key;
      role = "callee";
      startCall();
    }
  });
}

// START CALL
async function startCall() {
  setStatus("Connecting...");

  pc = new RTCPeerConnection(servers);

  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

  pc.ontrack = (e) => {
    document.getElementById("remoteVideo").srcObject = e.streams[0];
  };

  const callRef = db.ref("calls/" + roomId);

  // ICE
  pc.onicecandidate = (e) => {
    if (e.candidate) {
      callRef.child(role + "_candidates").push(JSON.stringify(e.candidate));
    }
  };

  const otherRole = role === "caller" ? "callee" : "caller";

  callRef.child(otherRole + "_candidates").on("child_added", async (snap) => {
    const c = new RTCIceCandidate(JSON.parse(snap.val()));
    try {
      await pc.addIceCandidate(c);
    } catch {}
  });

  if (role === "caller") {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await callRef.child("offer").set(JSON.stringify(offer));

    callRef.child("answer").on("value", async (snap) => {
      if (snap.exists()) {
        await pc.setRemoteDescription(JSON.parse(snap.val()));
      }
    });

  } else {
    callRef.child("offer").on("value", async (snap) => {
      if (!snap.exists()) return;

      await pc.setRemoteDescription(JSON.parse(snap.val()));

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await callRef.child("answer").set(JSON.stringify(answer));
    });
  }

  // DISCONNECT
  db.ref("rooms/" + roomId).on("value", (snap) => {
    if (!snap.exists()) {
      disconnect();
    }
  });

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "connected") {
      setStatus("Connected 🎉");
    }
  };
}

// DISCONNECT
function disconnect() {
  if (pc) {
    pc.close();
    pc = null;
  }

  document.getElementById("remoteVideo").srcObject = null;
  setStatus("Disconnected");
}

// NEXT
async function nextUser() {
  await cleanAll();
  disconnect();
  findMatch();
}

// BUTTONS
document.getElementById("findBtn").onclick = findMatch;
document.getElementById("nextBtn").onclick = nextUser;

// REFRESH CLEAN
window.onbeforeunload = () => {
  if (roomId) {
    db.ref("rooms/" + roomId).remove();
    db.ref("calls/" + roomId).remove();
  }
  db.ref("waiting/" + userId).remove();
};
