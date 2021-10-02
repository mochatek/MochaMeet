const sp = new SpeechSynthesisUtterance((volume = 2), (rate = 1), (pitch = 1));
[sp.voice] = speechSynthesis.getVoices();

const user = getName();

navigator.getUserMedia =
  navigator.getUserMedia ||
  navigator.webkitGetUserMedia ||
  navigator.mozGetUserMedia;

let localStream, remoteStream, isRoomCreator, rtcPeerConnection, currentStream;

const mediaConstraints = {
  video: true,
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
  },
};

const rtcConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
  ],
};

const fitBtn = document.querySelector("#fit-btn");
const localVideo = document.querySelector("#local-video");
const remoteVideo = document.querySelector("#remote-video");
const audioBtn = document.querySelector("#audio-btn");
const videoBtn = document.querySelector("#video-btn");
const streamBtn = document.querySelector("#stream-btn");
const userBtn = document.querySelector("#user-btn");
const peerName = document.querySelector("#peer-name");

// _________________ SOCKET ___________________

const socket = io();

joinRoom(user);

socket.on("notify", (data) => {
  if (data.status == "join") {
    peerName.innerText = data.user;
    sp.text = announce(`${data.user} has joined the call`);
  } else {
    announce(`${peerName.innerText} has left the call`);
    peerName.innerText += " left";
    remoteStream = null;
    remoteVideo.srcObject = null;
    rtcPeerConnection && rtcPeerConnection.close();
    setTimeout(() => (window.location.href = window.location.origin), 500);
  }
});

socket.on("room_created", async () => {
  await setLocalStream(mediaConstraints);
  isRoomCreator = true;
});

socket.on("room_joined", async (host) => {
  peerName.innerText = host;
  await setLocalStream(mediaConstraints);
  socket.emit("start_call", roomId);
});

socket.on("room_full", () => {
  announce(`This room is full. Please try another one`);
});

socket.on("start_call", async () => {
  if (isRoomCreator) {
    rtcPeerConnection = new RTCPeerConnection(rtcConfig);
    addLocalTracks(rtcPeerConnection);
    rtcPeerConnection.ontrack = setRemoteStream;
    rtcPeerConnection.onicecandidate = sendIceCandidate;
    await createOffer(rtcPeerConnection);
  }
});

socket.on("webrtc_offer", async (sdp) => {
  if (!isRoomCreator) {
    rtcPeerConnection = new RTCPeerConnection(rtcConfig);
    addLocalTracks(rtcPeerConnection);
    rtcPeerConnection.ontrack = setRemoteStream;
    rtcPeerConnection.onicecandidate = sendIceCandidate;
    rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
    await createAnswer(rtcPeerConnection);
  }
});

socket.on("webrtc_answer", (sdp) => {
  rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
});

socket.on("webrtc_ice_candidate", (event) => {
  let candidate = new RTCIceCandidate({
    sdpMLineIndex: event.label,
    candidate: event.candidate,
  });
  rtcPeerConnection.addIceCandidate(candidate);
});

// _______________ FUNCTIONS ___________________

function getName() {
  let name = localStorage.getItem("name");
  if (name) return name;
  while (!name) {
    name = prompt("Your Name ?");
    if (name) name = name.trim();
  }
  localStorage.setItem("name", name);
  announce(`Hello ${name}, welcome to mho-cha meets`);
  return name;
}

function joinRoom(user) {
  socket.emit("join", { roomId, user });
}

async function setLocalStream(mediaConstraints) {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
  } catch (error) {
    announce(error.message);
  }

  localStream = stream;
  localVideo.srcObject = stream;
  currentStream = "camera";
}

function addLocalTracks(rtcPeerConnection) {
  localStream.getTracks().forEach((track) => {
    rtcPeerConnection.addTrack(track, localStream);
  });
}

async function createOffer(rtcPeerConnection) {
  let sessionDescription;

  try {
    sessionDescription = await rtcPeerConnection.createOffer();
    rtcPeerConnection.setLocalDescription(sessionDescription);
  } catch (error) {
    console.error(error);
  }

  socket.emit("webrtc_offer", {
    type: "webrtc_offer",
    sdp: sessionDescription,
    roomId,
  });
}

async function createAnswer(rtcPeerConnection) {
  let sessionDescription;

  try {
    sessionDescription = await rtcPeerConnection.createAnswer();
    rtcPeerConnection.setLocalDescription(sessionDescription);
  } catch (error) {
    console.error(error);
  }

  socket.emit("webrtc_answer", {
    type: "webrtc_answer",
    sdp: sessionDescription,
    roomId,
  });
}

function setRemoteStream(event) {
  remoteVideo.srcObject = event.streams[0];
  remoteStream = event.stream;
}

function sendIceCandidate(event) {
  if (event.candidate) {
    socket.emit("webrtc_ice_candidate", {
      roomId,
      label: event.candidate.sdpMLineIndex,
      candidate: event.candidate.candidate,
    });
  }
}

function toggleFit() {
  if (fitBtn.className == "fas fa-compress") {
    fitBtn.className = "fas fa-expand";
    remoteVideo.style.objectFit = "contain";
  } else {
    fitBtn.className = "fas fa-compress";
    remoteVideo.style.objectFit = "cover";
  }
}

function toggleVideo() {
  if (localStream.getVideoTracks()[0].enabled) {
    videoBtn.className = "fas fa-video-slash";
  } else {
    videoBtn.className = "fas fa-video";
  }
  localStream.getVideoTracks()[0].enabled =
    !localStream.getVideoTracks()[0].enabled;
}

function toggleAudio() {
  if (localStream.getAudioTracks()[0].enabled) {
    audioBtn.className = "fas fa-microphone-slash";
  } else {
    audioBtn.className = "fas fa-microphone";
  }
  localStream.getAudioTracks()[0].enabled =
    !localStream.getAudioTracks()[0].enabled;
}

function toggleStream() {
  if (currentStream == "screen") {
    navigator.mediaDevices
      .getUserMedia(mediaConstraints)
      .then((newStream) => {
        if (localStream) {
          const videoTrack = localStream.getVideoTracks()[0];
          videoTrack && videoTrack.stop();
          videoTrack && localStream.removeTrack(videoTrack);
        }

        localStream.addTrack(newStream.getVideoTracks()[0]);

        if (rtcPeerConnection) {
          const sender = rtcPeerConnection
            .getSenders()
            .find((s) => s.track.kind == "video");
          sender.replaceTrack(localStream.getVideoTracks()[0]);
        }

        streamBtn.className = "fas fa-camera";
        currentStream = "camera";
        localVideo.style.transform = "rotateY(180deg)";
      })
      .catch((err) => announce(err.message));
  } else if (currentStream == "camera") {
    navigator.mediaDevices
      .getDisplayMedia()
      .then((newStream) => {
        if (localStream) {
          const videoTrack = localStream.getVideoTracks()[0];
          videoTrack && videoTrack.stop();
          videoTrack && localStream.removeTrack(videoTrack);
        }

        localStream.addTrack(newStream.getVideoTracks()[0]);

        if (rtcPeerConnection) {
          const sender = rtcPeerConnection
            .getSenders()
            .find((s) => s.track.kind == "video");
          sender.replaceTrack(localStream.getVideoTracks()[0]);
        }

        streamBtn.className = "fas fa-external-link-alt";
        currentStream = "screen";
        localVideo.style.transform = "rotateY(0deg)";
      })
      .catch((err) => announce(err.message));
  }
}

async function toggleUser() {
  if (localVideo.style.display == "") {
    localVideo.style.display = "none";
    userBtn.className = "fas fa-eye-slash";
  } else {
    localVideo.style.display = "";
    userBtn.className = "fas fa-eye";
  }
}

function hangUp() {
  socket.emit("leave", roomId);
  socket.close();
  peerName.innerText = "";
  remoteStream = null;
  remoteVideo.srcObject = null;
  rtcPeerConnection && rtcPeerConnection.close();
  setTimeout(() => (window.location.href = window.location.origin), 500);
}

function gotoGitRepo() {
  window.open("https://github.com/mochatek/MochaMeet", "_blank");
}

async function shareInvite() {
  const url = window.location.href;
  const data = {
    title: "MochaMeetz",
    text: "Free video calls and screen sharing",
    url,
  };
  await navigator.share(data);
}

function announce(msg) {
  sp.text = msg;
  speechSynthesis.speak(sp);
}

window.onbeforeunload = hangUp;
