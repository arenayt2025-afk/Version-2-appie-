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
let roomId = null;
let userId = Math.random().toString(36).substr(2, 9);

// STUN
const servers = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

function setStatus(s) {
  document.getElementById("status").innerText = s;
}

// 🎥 CAMERA
async function init() {
  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
  });
  document.getElementById("local").srcObject = localStream;
}
init();


// 🔥 FIND LOGIC (ROOM BASED)
async function find() {
  setStatus("Searching...");

  const roomsRef = db.ref("rooms");
  const snap = await roomsRef.once("value");

  let found = false;

  if (snap.exists()) {
    snap.forEach(room => {
      const users = room.val().users || {};

      if (Object.keys(users).length === 1 && !found) {
        // 🔥 join existing room
        roomId = room.key;

        roomsRef.child(roomId + "/users/" + userId).set(true);

        found = true;

        startCall();
      }
    });
  }

  if (!found) {
    // 🔥 create new room
    roomId = "room_" + Date.now();

    await roomsRef.child(roomId).set({
      users: {
        [userId]: true
      }
    });

    // wait for second user
    roomsRef.child(roomId + "/users").on("value", snap => {
      const users = snap.val();

      if (users && Object.keys(users).length === 2) {
        startCall();
      }
    });
  }
}


// 🚀 START CALL
async function startCall() {
  setStatus("Connecting...");

  pc = new RTCPeerConnection(servers);

  localStream.getTracks().forEach(track => {
    pc.addTrack(track, localStream);
  });

  pc.ontrack = e => {
    document.getElementById("remote").srcObject = e.streams[0];
  };

  const callRef = db.ref("calls/" + roomId);

  // ICE
  pc.onicecandidate = e => {
    if (e.candidate) {
      callRef.push(JSON.stringify(e.candidate));
    }
  };

  callRef.on("child_added", async snap => {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(JSON.parse(snap.val())));
    } catch {}
  });

  // OFFER / ANSWER
  const offerRef = db.ref("calls/" + roomId + "/offer");

  const offerSnap = await offerRef.once("value");

  if (!offerSnap.exists()) {
    // caller
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await offerRef.set(JSON.stringify(offer));

    db.ref("calls/" + roomId + "/answer").on("value", async snap => {
      if (snap.exists()) {
        await pc.setRemoteDescription(JSON.parse(snap.val()));
      }
    });

  } else {
    // callee
    await pc.setRemoteDescription(JSON.parse(offerSnap.val()));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    await db.ref("calls/" + roomId + "/answer").set(JSON.stringify(answer));
  }

  // 🔥 DISCONNECT LISTENER
  db.ref("rooms/" + roomId + "/users").on("value", snap => {
    const users = snap.val();

    if (!users || Object.keys(users).length < 2) {
      disconnect();

      setStatus("Searching...");
    }
  });
}


// 🔥 NEXT LOGIC (IMPORTANT)
async function next() {

  if (!roomId) return;

  // remove self
  await db.ref("rooms/" + roomId + "/users/" + userId).remove();

  disconnect();

  // check room
  const snap = await db.ref("rooms/" + roomId + "/users").once("value");

  if (!snap.exists()) {
    // no user → delete room
    await db.ref("rooms/" + roomId).remove();
    await db.ref("calls/" + roomId).remove();
  }

  roomId = null;

  find(); // auto search
}


// 🔥 DISCONNECT
function disconnect() {
  if (pc) {
    pc.close();
    pc = null;
  }

  document.getElementById("remote").srcObject = null;
}


// 🔥 REFRESH CLEAN
window.onbeforeunload = async () => {
  if (roomId) {
    await db.ref("rooms/" + roomId + "/users/" + userId).remove();

    const snap = await db.ref("rooms/" + roomId + "/users").once("value");

    if (!snap.exists()) {
      await db.ref("rooms/" + roomId).remove();
      await db.ref("calls/" + roomId).remove();
    }
  }
};
