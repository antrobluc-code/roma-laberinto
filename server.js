import * as THREE from 'three';

const teclas = {};
let inclinacionX = 0, inclinacionZ = 0;

window.addEventListener('keydown', (e) => { teclas[e.key] = true; });
window.addEventListener('keyup', (e) => { teclas[e.key] = false; });

let escena, camara, renderizador, miBola, socket, meta, flechaGuia;
let muros = []; 
let juegoTerminado = false; 
let microActivo = false;
let mediaRecorder;
let alturaCamara = 1500; 

const videoFeed = document.getElementById('video-feed');
const compañeros = {}; 
const sonidoBocina = new Audio('bocina.mp3'); 

const TAMANO_MAPA = 75;
const mapaRoma = [];
for (let f = 0; f < TAMANO_MAPA; f++) {
    mapaRoma[f] = [];
    for (let c = 0; c < TAMANO_MAPA; c++) {
        if (f === 0 || f === TAMANO_MAPA-1 || c === 0 || c === TAMANO_MAPA-1) mapaRoma[f][c] = 1;
        else if ((f < 6 && c < 6) || (f > TAMANO_MAPA-7 && c > TAMANO_MAPA-7)) mapaRoma[f][c] = 0;
        else mapaRoma[f][c] = Math.random() > 0.8 ? 1 : 0;
    }
}

function crearInterfazUI() {
    const contenedor = document.createElement('div');
    contenedor.className = "control-panel";
    const vistas = [
        { nombre: "🚁 DRON", alt: 100 },
        { nombre: "🏘️ BARRIO", alt: 400 },
        { nombre: "🛰️ SAT", alt: 1500 }
    ];
    vistas.forEach(v => {
        const btn = document.createElement('button');
        btn.innerHTML = v.nombre; btn.className = "btn-ui";
        btn.onclick = () => { alturaCamara = v.alt; };
        contenedor.appendChild(btn);
    });

    const btnBocina = document.createElement('button');
    btnBocina.innerHTML = "📢"; btnBocina.className = "btn-ui btn-orange";
    btnBocina.onclick = () => { sonidoBocina.play(); socket.emit('tocar_bocina', { x: miBola.position.x, z: miBola.position.z }); };
    contenedor.appendChild(btnBocina);

    const btnMicro = document.createElement('button');
    btnMicro.innerHTML = "🎤"; btnMicro.id = "btn-micro-id"; btnMicro.className = "btn-ui btn-gray";
    btnMicro.onmousedown = () => { microActivo = true; gestionarMicro(); };
    btnMicro.onmouseup = () => { microActivo = false; gestionarMicro(); };
    contenedor.appendChild(btnMicro);

    const btnGiro = document.createElement('button');
    btnGiro.innerHTML = "🔄 Giro"; btnGiro.className = "btn-ui btn-purple";
    btnGiro.onclick = pedirPermisoGiroscopio;
    contenedor.appendChild(btnGiro);

    const estilo = document.createElement('style');
    estilo.innerHTML = `
        .control-panel { position: fixed; top: 10px; left: 50%; transform: translateX(-50%); display: flex; gap: 5px; z-index: 2000; background: rgba(0,0,0,0.6); padding: 10px; border-radius: 30px; backdrop-filter: blur(8px); }
        .btn-ui { padding: 10px 15px; border: none; border-radius: 20px; color: white; background: #4285f4; font-size: 12px; font-weight: bold; cursor: pointer; }
        .btn-orange { background: #f4b400; } .btn-gray { background: #5f6368; } .btn-purple { background: #9c27b0; }
        #game-canvas { position: fixed; top:0; left:0; width:100vw; height:100vh; }
    `;
    document.head.appendChild(estilo); document.body.appendChild(contenedor);
}

function pedirPermisoGiroscopio() {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission().then(state => { if (state === 'granted') activarGiro(); });
    } else { activarGiro(); }
}

function activarGiro() {
    window.addEventListener('deviceorientation', (e) => {
        inclinacionX = e.gamma * 0.08; inclinacionZ = (e.beta - 45) * 0.08;
    });
}

async function gestionarMicro() {
    if (microActivo) {
        try {
            const s = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(s);
            mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0 && socket) socket.emit('audio_stream', { audio: e.data, pos: miBola.position }); };
            mediaRecorder.start(200);
        } catch(e) { microActivo = false; }
    } else if (mediaRecorder) mediaRecorder.stop();
}

async function iniciarJuego() {
    socket = io();
    const sala = document.getElementById('room-input').value || "General";
    socket.emit('unirse', { sala: sala });

    renderizador = new THREE.WebGLRenderer({ canvas: document.getElementById('game-canvas'), antialias: true });
    renderizador.setSize(window.innerWidth, window.innerHeight);

    escena = new THREE.Scene(); escena.background = new THREE.Color(0xf0f3f4);
    camara = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 1, 5000);
    escena.add(new THREE.AmbientLight(0xffffff, 1.2));

    const tam = 35;
    const mGeo = new THREE.BoxGeometry(tam, 15, tam);
    mapaRoma.forEach((f, r) => {
        f.forEach((v, c) => {
            if (v === 1) {
                const m = new THREE.Mesh(mGeo, new THREE.MeshBasicMaterial({ color: 0xdddddd }));
                m.position.set((c - 37.5) * tam, 7.5, (r - 37.5) * tam);
                escena.add(m); muros.push(m);
            }
        });
    });

    miBola = new THREE.Mesh(new THREE.PlaneGeometry(28, 28), new THREE.MeshBasicMaterial({ map: new THREE.VideoTexture(videoFeed), side: THREE.DoubleSide }));
    miBola.position.set((-34) * tam, 3.1, (-34) * tam);
    miBola.rotation.x = -Math.PI / 2;
    escena.add(miBola);

    meta = new THREE.Mesh(new THREE.SphereGeometry(25, 32, 32), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    meta.position.set((34) * tam, 10, (34) * tam);
    escena.add(meta);

    flechaGuia = new THREE.Mesh(new THREE.ConeGeometry(5, 15, 16), new THREE.MeshBasicMaterial({ color: 0x4285f4 }));
    flechaGuia.rotateX(Math.PI / 2); escena.add(flechaGuia);

    window.addEventListener('resize', () => {
        camara.aspect = window.innerWidth / window.innerHeight;
        camara.updateProjectionMatrix();
        renderizador.setSize(window.innerWidth, window.innerHeight);
    });

    crearInterfazUI();
    animar();
}

function animar() {
    requestAnimationFrame(animar);
    if (!miBola || juegoTerminado) return;

    const velBase = 3.0;
    const posAnterior = miBola.position.clone();

    if (teclas['w'] || teclas['ArrowUp']) miBola.position.z -= velBase;
    if (teclas['s'] || teclas['ArrowDown']) miBola.position.z += velBase;
    if (teclas['a'] || teclas['ArrowLeft']) miBola.position.x -= velBase;
    if (teclas['d'] || teclas['ArrowRight']) miBola.position.x += velBase;

    miBola.position.x += inclinacionX * 10;
    miBola.position.z += inclinacionZ * 10;

    const cajaBola = new THREE.Box3().setFromObject(miBola);
    let chocado = false;
    for (let m of muros) if (cajaBola.intersectsBox(new THREE.Box3().setFromObject(m))) { chocado = true; break; }

    if (chocado) {
        const dir = new THREE.Vector3().subVectors(miBola.position, posAnterior);
        miBola.position.copy(posAnterior);
        miBola.position.x -= dir.x * 0.7; miBola.position.z -= dir.z * 0.7;
    }

    socket.emit('mover', { x: miBola.position.x, z: miBola.position.z });

    if (alturaCamara === 1500) { camara.position.set(0, 1500, 0.5); camara.lookAt(0,0,0); }
    else { camara.position.set(miBola.position.x, alturaCamara, miBola.position.z + 0.1); camara.lookAt(miBola.position.x, 0, miBola.position.z); }

    flechaGuia.position.copy(miBola.position).add(new THREE.Vector3().subVectors(meta.position, miBola.position).normalize().multiplyScalar(45));
    flechaGuia.lookAt(meta.position);

    renderizador.render(escena, camara);
}

document.getElementById('camera-btn').addEventListener('click', async () => {
    const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    videoFeed.srcObject = s; videoFeed.play();
    iniciarJuego();
    document.getElementById('menu-lateral').style.display = 'none';
});