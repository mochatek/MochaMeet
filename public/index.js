const user = getName()

document.querySelector('#roomURL').value = `${ window.location.href }`

const localVideo = document.querySelector('#local-video')
const remoteVideo = document.querySelector('#remote-video')
const audioBtn = document.querySelector('#audioBtn')
const videoBtn = document.querySelector('#videoBtn')
const streamBtn = document.querySelector('#streamBtn')
const userBtn = document.querySelector('#userBtn')
const peerName = document.querySelector('#peerName')

let localStream, remoteStream, isRoomCreator, rtcPeerConnection, currentStream

const mediaConstraints = {
    video: true,
    audio: {
        echoCancellation: true,
        noiseSuppression: true
    }
  }

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ],
}

// _________________ SOCKET ___________________

const socket = io()

joinRoom(user)

socket.on('notify', (data) => {
    if(data.status == 'join') {
        peerName.innerText = data.user
    } else {
        peerName.innerText = ''
        remoteStream = null
        remoteVideo.srcObject = null
        rtcPeerConnection.close()
    }
})

socket.on('room_created', async () => {
    await setLocalStream(mediaConstraints)
    isRoomCreator = true
})

socket.on('room_joined', async (host) => {
    peerName.innerText = host
    await setLocalStream(mediaConstraints)
    socket.emit('start_call', roomId)
})

socket.on('room_full', () => {
    alert('The room is full. Please try another one')
})

socket.on('start_call', async () => {
    if (isRoomCreator) {
        rtcPeerConnection = new RTCPeerConnection(rtcConfig)
        addLocalTracks(rtcPeerConnection)
        rtcPeerConnection.ontrack = setRemoteStream
        rtcPeerConnection.onicecandidate = sendIceCandidate
        await createOffer(rtcPeerConnection)
    }
})

socket.on('webrtc_offer', async (sdp) => {
    if (!isRoomCreator) {
        rtcPeerConnection = new RTCPeerConnection(rtcConfig)
        addLocalTracks(rtcPeerConnection)
        rtcPeerConnection.ontrack = setRemoteStream
        rtcPeerConnection.onicecandidate = sendIceCandidate
        rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(sdp))
        await createAnswer(rtcPeerConnection)
    }
})

socket.on('webrtc_answer', (sdp) => {
    rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(sdp))
})

socket.on('webrtc_ice_candidate', (event) => {
    let candidate = new RTCIceCandidate({
        sdpMLineIndex: event.label,
        candidate: event.candidate,
    })
    rtcPeerConnection.addIceCandidate(candidate)
})

// _______________ FUNCTIONS ___________________

function getName() {
    let name = localStorage.getItem('name')
    if(name) return name
    while(!name) {
        name = prompt('Your Name ?')
        if(name) name = name.trim()
    }
    localStorage.setItem('name', name)
    return name
}

function joinRoom(user) {
    socket.emit('join', {roomId, user})
}

async function setLocalStream(mediaConstraints) {
    let stream
    try {
        stream = await navigator.mediaDevices.getUserMedia(mediaConstraints)
    } catch (error) {
        alert(error.message)
    }

    localStream = stream
    localVideo.srcObject = stream
    currentStream = 'camera'
}

function addLocalTracks(rtcPeerConnection) {
    localStream.getTracks().forEach((track) => {
        rtcPeerConnection.addTrack(track, localStream)
    })
}

async function createOffer(rtcPeerConnection) {
    let sessionDescription

    try {
        sessionDescription = await rtcPeerConnection.createOffer()
        rtcPeerConnection.setLocalDescription(sessionDescription)
    } catch (error) {
        console.error(error)
    }

    socket.emit('webrtc_offer', {
        type: 'webrtc_offer',
        sdp: sessionDescription,
        roomId,
    })
}

async function createAnswer(rtcPeerConnection) {
    let sessionDescription

    try {
        sessionDescription = await rtcPeerConnection.createAnswer()
        rtcPeerConnection.setLocalDescription(sessionDescription)
    } catch (error) {
        console.error(error)
    }

    socket.emit('webrtc_answer', {
        type: 'webrtc_answer',
        sdp: sessionDescription,
        roomId,
    })
}

function setRemoteStream(event) {
    remoteVideo.srcObject = event.streams[0]
    remoteStream = event.stream
}

function sendIceCandidate(event) {
    if (event.candidate) {
        socket.emit('webrtc_ice_candidate', {
            roomId,
            label: event.candidate.sdpMLineIndex,
            candidate: event.candidate.candidate,
      })
    }
}

function toggleVideo() {
    if(localStream.getVideoTracks()[0].enabled) {
        videoBtn.className = 'fas fa-video-slash'
    } else {
        videoBtn.className = 'fas fa-video'
    }
    localStream.getVideoTracks()[0].enabled = !localStream.getVideoTracks()[0].enabled
}

function toggleAudio() {
    if(localStream.getAudioTracks()[0].enabled) {
        audioBtn.className = 'fas fa-microphone-slash'
    } else {
        audioBtn.className = 'fas fa-microphone'
    }
    localStream.getAudioTracks()[0].enabled = !localStream.getAudioTracks()[0].enabled
}

async function toggleStream() {
    if(localStream) {
        const videoTrack = localStream.getVideoTracks()[0]
        videoTrack.stop()
        localStream.removeTrack(videoTrack)
    }
    if(currentStream == 'screen') {
        try {
            const newStream = await navigator.mediaDevices.getUserMedia(mediaConstraints)
            localStream.addTrack(newStream.getVideoTracks()[0])

        if(rtcPeerConnection) {
            const sender = rtcPeerConnection.getSenders().find(s => s.track.kind == 'video')
            sender.replaceTrack(localStream.getVideoTracks()[0])
        }

            streamBtn.className = 'fas fa-camera'
            currentStream = 'camera'
            localVideo.style.transform = 'rotateY(180deg)'
        } catch(err) {
            alert(err.message)
        }
    } else if(currentStream == 'camera') {
        try {
            const newStream = await navigator.mediaDevices.getDisplayMedia()
            localStream.addTrack(newStream.getVideoTracks()[0])

        if(rtcPeerConnection) {
            const sender = rtcPeerConnection.getSenders().find(s => s.track.kind == 'video')
            sender.replaceTrack(localStream.getVideoTracks()[0])
        }

            streamBtn.className = 'fas fa-tablet-alt'
            currentStream = 'screen'
            localVideo.style.transform = 'rotateY(0deg)'
        } catch(err) {
            alert(err.message)
        }
    }
}

async function toggleUser() {
    if(localVideo.style.display == '') {
        localVideo.style.display = 'none'
        userBtn.className = 'fas fa-eye-slash'
    } else {
        localVideo.style.display = ''
        userBtn.className = 'fas fa-eye'
    }
}

function hangUp(event=null) {
    socket.emit('leave', roomId)
    socket.close();
    peerName.innerText = ''
    remoteStream = null
    remoteVideo.srcObject = null
    if(rtcPeerConnection) {
        rtcPeerConnection.close()
    }
    alert('Call Ended.')
}

function gotoGitRepo() {
    window.open('https://github.com/mochatek/MochaMeet', '_blank')
}

window.onbeforeunload = hangUp
