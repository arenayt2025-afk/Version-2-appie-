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

let localStream = null;
let remoteStream = new MediaStream();
let pc = null;
let roomId = null;
let userId = Math.random().toString(36).substr(2, 9);

// FIXES
let pendingCandidates = [];
let isRemoteDescSet = false;
let callStarted = false;

// STUN
const servers = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

function setStatus(text) {
  document.getElementById("status").innerText = "Status: " + text;
  console.log(text);
}

// 🎥 CAMERA
async function initMedia() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    document.getElementById("localVideo").srcObject = localStream;

  } catch (e) {
    alert("Camera error");
  }
}

window.onload = initMedia;

// 🔥 CLEAN
async function cleanRoom() {
  try {
    if (roomId) {
      await db.ref("rooms/" + roomId).remove();
      await db.ref("calls/" + roomId).remove();
    }

    await db.ref("waiting/" + userId).remove();

  } catch (e) {
    console.log(e);
  }
}

// 🔥 FIND MATCH (QUEUE SYSTEM)
async function findMatch() {
  setStatus("Searching...");

  const waitingRef = db.ref("waiting");

  const snap = await waitingRef.once("value");

  // 👉 if someone waiting → connect
  if (snap.exists()) {
    const users = snap.val();
    const otherUserId = Object.keys(users)[0];

    if (otherUserId !== userId) {
      console.log("Matched with:", otherUserId);

      await waitingRef.child(otherUserId).remove();

      roomId = "room_" + Date.now();

      await db.ref("rooms/" + roomId).set({
        users: {
          [userId]: true,
          [otherUserId]: true
        }
      });

      startCall(true);
      return;
    }
  }

  // 👉 no one → wait
  console.log("Waiting for user...");

  await waitingRef.child(userId).set(true);

  // listen for room
  db.ref("rooms").on("child_added", (snap) => {
    const room = snap.val();

    if (room.users && room.users[userId]) {
      roomId = snap.key;

      console.log("Joined room:", roomId);

      startCall(false);
    }
  });
}

// 🚀 START CALL
async function startCall(isCaller) {

  if (callStarted) return;
  callStarted = true;

  setStatus("Connecting...");

  pc = new RTCPeerConnection(servers);

  localStream.getTracks().forEach(track => {
    pc.addTrack(track, localStream);
  });

  pc.ontrack = (event) => {
    remoteStream.addTrack(event.track);
    document.getElementById("remoteVideo").srcObject = remoteStream;
  };

  const roomRef = db.ref("calls/" + roomId);

  // ICE SEND
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      roomRef.child("candidates").push(JSON.stringify(event.candidate));
    }
  };

  // ICE RECEIVE
  roomRef.child("candidates").on("child_added", async (snap) => {
    const candidate = new RTCIceCandidate(JSON.parse(snap.val()));

    if (isRemoteDescSet) {
      await pc.addIceCandidate(candidate);
    } else {
      pendingCandidates.push(candidate);
    }
  });

  if (isCaller) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await roomRef.child("offer").set(JSON.stringify(offer));

    roomRef.child("answer").on("value", async (snap) => {
      if (snap.exists()) {
        const answer = JSON.parse(snap.val());

        await pc.setRemoteDescription(answer);

        isRemoteDescSet = true;

        for (let c of pendingCandidates) {
          await pc.addIceCandidate(c);
        }
        pendingCandidates = [];
      }
    });

  } else {
    roomRef.child("offer").on("value", async (snap) => {
      if (snap.exists()) {
        const offer = JSON.parse(snap.val());

        await pc.setRemoteDescription(offer);

        isRemoteDescSet = true;

        for (let c of pendingCandidates) {
          await pc.addIceCandidate(c);
        }
        pendingCandidates = [];

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        await roomRef.child("answer").set(JSON.stringify(answer));
      }
    });
  }

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "connected") {
      setStatus("Connected 🎉");
    }
  };
}

// 🔁 NEXT
async function nextUser() {
  if (pc) pc.close();

  await cleanRoom();

  callStarted = false;
  isRemoteDescSet = false;
  pendingCandidates = [];

  setStatus("Searching...");

  findMatch();
}

// BUTTONS
document.getElementById("findBtn").onclick = findMatch;
document.getElementById("nextBtn").onclick = nextUser;

// 🔥 REFRESH CLEAN
window.onbeforeunload = () => {
  if (roomId) {
    db.ref("rooms/" + roomId).remove();
    db.ref("calls/" + roomId).remove();
  }
  db.ref("waiting/" + userId).remove();
};
