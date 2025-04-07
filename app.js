    const express = require('express');
    const path = require('path');
    const { Pool } = require('pg');
    const session = require('express-session');
    const bodyParser = require('body-parser');
    require('dotenv').config();

    const app = express();

    // Base de datos
    const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 5432,
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false
    });

    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));
    app.use(express.static("public"));
    app.use(session({
    secret: process.env.SESSION_SECRET || "supersecret",
    resave: false,
    saveUninitialized: false
    }));

    // Sanitización
    function validarInput(input) {
    const forbidden = ["select", "drop", "insert", "update", "delete", "database", "from", "where", "or", "and", "--"];
    const lowerInput = input.toLowerCase();
    return !forbidden.some(word => lowerInput.includes(word)) && !/[<>]/.test(input);
    }

    function sanitize(value) {
    return value.replace(/[<>]/g, '');
    }

    // Mostrar index
    app.get("/", (req, res) => {
    const autenticado = !!req.session.user;
    const esAdmin = req.session.user?.rol === "admin";

    res.sendFile(path.join(__dirname, "public", "index.html")); // Para ahora sigue siendo HTML estático.
    });

    // Registro
    app.post("/register", (req, res) => {
    const { username, password, admin_key } = req.body;

    if (!username || !password) {
        return res.status(400).send("Faltan datos");
    }

    if (!validarInput(username) || !validarInput(password)) {
        return res.status(400).send("Datos inválidos");
    }

    const rol = (admin_key === process.env.ADMIN_KEY) ? "admin" : "user";

    pool.query(
        "INSERT INTO usuarios (username, password, rol) VALUES ($1, $2, $3)",
        [sanitize(username), sanitize(password), rol],
        (err) => {
        if (err) {
            console.error("Error al registrar:", err);
            return res.status(500).send("Error al registrar");
        }

        req.session.user = { username, rol };
        res.redirect("/");
        }
    );
    });

    // Login
    app.post("/login", (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).send("Faltan datos");
    }

    pool.query(
        "SELECT * FROM usuarios WHERE username = $1",
        [username],
        (err, result) => {
        if (err) {
            console.error("Error al iniciar sesión:", err);
            return res.status(500).send("Error en el servidor");
        }

        if (result.rows.length === 0) {
            return res.status(401).send("Usuario no encontrado");
        }

        const usuario = result.rows[0];

        if (usuario.password !== password) {
            return res.status(401).send("Contraseña incorrecta");
        }

        req.session.user = {
            id: usuario.id,
            username: usuario.username,
            rol: usuario.rol
        };

        res.redirect("/");
        }
    );
    });

    // Logout
    app.get("/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/");
    });
    });

    // Iniciar servidor
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
    console.log(`🚀 Servidor escuchando en el puerto ${PORT}`);
    });
