const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Esto sirve los archivos de la carpeta public
app.use(express.static(path.join(__dirname, 'public')));

let jugadores = {};

io.on('connection', (socket) => {
    socket.on('unirse', (data) => {
        socket.join(data.sala);
        jugadores[socket.id] = { x: 0, z: 0, sala: data.sala };
    });

    socket.on('mover', (data) => {
        if (jugadores[socket.id]) {
            jugadores[socket.id].x = data.x;
            jugadores[socket.id].z = data.z;
            io.to(jugadores[socket.id].sala).emit('jugadores', jugadores);
        }
    });

    socket.on('tocar_bocina', (data) => {
        if (jugadores[socket.id]) {
            socket.to(jugadores[socket.id].sala).emit('sonar_bocina', data);
        }
    });

    socket.on('audio_stream', (data) => {
        if (jugadores[socket.id]) {
            socket.to(jugadores[socket.id].sala).emit('recibir_audio', data);
        }
    });

    socket.on('disconnect', () => {
        delete jugadores[socket.id];
        io.emit('jugadores', jugadores);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor funcionando en puerto ${PORT}`);
});
