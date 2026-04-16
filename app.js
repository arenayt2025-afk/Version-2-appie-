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


// 🔥 FIND (RACE SAFE)
async function find() {
  setStatus("Searching...");

  const roomsRef = db.ref("rooms");

  let joined = false;

  // 🔥 TRANSACTION (LOCK SYSTEM)
  await roomsRef.transaction((rooms) => {
    if (!rooms) rooms = {};

    for (let id in rooms) {
      const users = rooms[id].users || {};

      if (Object.keys(users).length === 1) {
        // join this room
        rooms[id].users[userId] = true;
        roomId = id;
        joined = true;
        return rooms;
      }
    }

    // no room → create
    if (!joined) {
      roomId = "room_" + Date.now();
      rooms[roomId] = {
        users: {
          [userId]: true
        }
      };
    }

    return rooms;
  });

  // 🔥 AFTER TRANSACTION
  const snap = await db.ref("rooms/" + roomId + "/users").once("value");
  const count = Object.keys(snap.val()).length;

  if (count === 2) {
    startCall();
  } else {
    // wait for second user
    db.ref("rooms/" + roomId + "/users").on("value", (snap) => {
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

  await db.ref("calls/" + roomId).remove();

  pc = new RTCPeerConnection(servers);

  localStream.getTracks().forEach(track => {
    pc.addTrack(track, localStream);
  });

  pc.ontrack = (e) => {
    document.getElementById("remote").srcObject = e.streams[0];
  };

  const callRef = db.ref("calls/" + roomId);

  const callerCandidates = callRef.child("callerCandidates");
  const calleeCandidates = callRef.child("calleeCandidates");

  const roomSnap = await db.ref("rooms/" + roomId).once("value");
  const users = Object.keys(roomSnap.val().users);

  const isCaller = users[0] === userId;

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      if (isCaller) {
        callerCandidates.push(JSON.stringify(e.candidate));
      } else {
        calleeCandidates.push(JSON.stringify(e.candidate));
      }
    }
  };

  if (isCaller) {
    calleeCandidates.on("child_added", async snap => {
      await pc.addIceCandidate(new RTCIceCandidate(JSON.parse(snap.val())));
    });
  } else {
    callerCandidates.on("child_added", async snap => {
      await pc.addIceCandidate(new RTCIceCandidate(JSON.parse(snap.val())));
    });
  }

  if (isCaller) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await callRef.child("offer").set(JSON.stringify(offer));

    callRef.child("answer").on("value", async snap => {
      if (snap.exists()) {
        await pc.setRemoteDescription(JSON.parse(snap.val()));
      }
    });

  } else {
    callRef.child("offer").on("value", async snap => {
      if (!snap.exists()) return;

      await pc.setRemoteDescription(JSON.parse(snap.val()));

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await callRef.child("answer").set(JSON.stringify(answer));
    });
  }

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "connected") {
      setStatus("Connected 🎉");
    }
  };

  // 🔥 IMPORTANT: ANY USER LEFT → DELETE ROOM
  db.ref("rooms/" + roomId + "/users").on("value", async (snap) => {
    const users = snap.val();

    if (!users || Object.keys(users).length < 2) {
      await db.ref("rooms/" + roomId).remove();
      await db.ref("calls/" + roomId).remove();

      disconnect();
      setStatus("Searching...");
    }
  });
}


// 🔁 NEXT
async function next() {
  if (!roomId) return;

  await db.ref("rooms/" + roomId + "/users/" + userId).remove();

  await db.ref("rooms/" + roomId).remove();
  await db.ref("calls/" + roomId).remove();

  disconnect();

  roomId = null;

  find();
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
    await db.ref("rooms/" + roomId).remove();
    await db.ref("calls/" + roomId).remove();
  }
};



