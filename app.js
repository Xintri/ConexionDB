const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();
const session = require('express-session');

const app = express();

// 🚀 Conexión a Neon
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 5432,
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false
});

pool.connect()
    .then(() => console.log("✅ Conectado a la BD"))
    .catch(err => {
        console.error("❌ Error al conectar a la BD:", err);
        process.exit(1);
    });

// Middlewares
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(session({
    secret: process.env.SESSION_SECRET || 'secret_key_default',
    resave: false,
    saveUninitialized: false,
}));

// Middleware para mensajes
app.use((req, res, next) => {
    res.locals.message = req.session.message;
    delete req.session.message;
    next();
});

// 🛡️ Sanitización
function validarInput(input) {
    const palabrasProhibidas = ['select', 'drop', 'from', 'insert', 'delete', 'update', 'database', 'table'];
    const lowerInput = input.toLowerCase();
    for (const palabra of palabrasProhibidas) {
        if (lowerInput.includes(palabra)) {
            return false;
        }
    }
    return !/[<>]/.test(input);
}

function sanitize(value) {
    return value.replace(/[<>]/g, "").trim();
}

// ─── RUTAS ────────────────────────────────────────────────

// Página inicial (Index)
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Login
app.post("/login", (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.redirect("/?mensaje=" + encodeURIComponent("❌ Faltan datos para iniciar sesión"));
    }

    pool.query("SELECT * FROM usuarios WHERE username = $1", [username], (err, result) => {
        if (err) {
            console.error("Error en login:", err);
            return res.redirect("/?mensaje=" + encodeURIComponent("❌ Error en el servidor"));
        }
        if (result.rows.length === 0) {
            return res.redirect("/?mensaje=" + encodeURIComponent("❌ Usuario no encontrado"));
        }

        const usuario = result.rows[0];

        if (usuario.password !== password) {
            return res.redirect("/?mensaje=" + encodeURIComponent("❌ Contraseña incorrecta"));
        }

        req.session.user = {
            id: usuario.id,
            username: usuario.username,
            rol: usuario.rol
        };

        res.redirect("/?mensaje=" + encodeURIComponent("✅ Inicio de sesión exitoso"));
    });
});

// Registro
app.post("/register", (req, res) => {
    const { username, password, admin_key } = req.body;

    if (!username || !password) {
        return res.redirect("/?mensaje=" + encodeURIComponent("❌ Faltan datos para registrar"));
    }
    if (!validarInput(username) || !validarInput(password)) {
        return res.redirect("/?mensaje=" + encodeURIComponent("❌ Entrada inválida"));
    }

    // 🔥 Clave secreta para ser admin
    const CLAVE_SECRETA_ADMIN = "Kyrbychu";

    let rol = 'user';
    if (admin_key === CLAVE_SECRETA_ADMIN) {
        rol = 'admin';
    }

    pool.query("INSERT INTO usuarios (username, password, rol) VALUES ($1, $2, $3)", 
        [sanitize(username), sanitize(password), rol], 
        (err) => {
            if (err) {
                console.error("❌ Error al registrar:", err);
                return res.redirect("/?mensaje=" + encodeURIComponent("❌ Error al registrar usuario"));
            }
            if (rol === 'admin') {
                res.redirect("/?mensaje=" + encodeURIComponent("✅ Registro exitoso como ADMIN"));
            } else {
                res.redirect("/?mensaje=" + encodeURIComponent("✅ Registro exitoso como usuario"));
            }
    });
});

// Logout
app.get("/logout", (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error("Error al cerrar sesión", err);
        }
        res.redirect("/?mensaje=" + encodeURIComponent("✅ Has cerrado sesión correctamente"));
    });
});

// ─── ANGELES ────────────────────────────────────────────────
// Agregar Ángel
app.post("/agregarAngel", (req, res) => {
    let { nombre, codigo, jerarquia, captura, estado } = req.body;
    if (!validarInput(nombre) || !validarInput(codigo) || !validarInput(captura) || !validarInput(estado)) {
        return res.redirect("/?mensaje=" + encodeURIComponent("❌ Entrada inválida al agregar ángel"));
    }
    pool.query(
        "INSERT INTO angeles (nombre, codigo, jerarquia, captura, estado) VALUES ($1, $2, $3, $4, $5)",
        [sanitize(nombre), sanitize(codigo), jerarquia, sanitize(captura), estado],
        (err) => {
            if (err) {
                console.error("❌ Error al agregar ángel:", err);
                return res.redirect("/?mensaje=" + encodeURIComponent("❌ Error en el servidor al agregar ángel"));
            }
            res.redirect("/?mensaje=" + encodeURIComponent("✅ Ángel registrado exitosamente"));
        }
    );
});

// Editar Ángel
app.post("/actualizarAngel/:id", (req, res) => {
    const angelId = req.params.id;
    const { nombre, codigo, jerarquia, captura, estado } = req.body;

    if (!validarInput(nombre) || !validarInput(codigo) || !validarInput(captura) || !validarInput(estado)) {
        return res.redirect("/?mensaje=" + encodeURIComponent("❌ Entrada inválida al editar ángel"));
    }

    pool.query(
        "UPDATE angeles SET nombre = $1, codigo = $2, jerarquia = $3, captura = $4, estado = $5 WHERE id = $6",
        [sanitize(nombre), sanitize(codigo), jerarquia, sanitize(captura), sanitize(estado), angelId],
        (err) => {
            if (err) {
                console.error("❌ Error al actualizar ángel:", err);
                return res.redirect("/?mensaje=" + encodeURIComponent("❌ Error al actualizar ángel"));
            }
            res.redirect("/?mensaje=" + encodeURIComponent("✅ Ángel editado exitosamente"));
        }
    );
});

// ─── EXPERIMENTOS ────────────────────────────────────────────────
// Agregar Experimento
app.post("/agregarExperimento", (req, res) => {
    let { numero_experimento, tipo_experimento, descripcion, resultado } = req.body;
    if (!numero_experimento || !validarInput(descripcion) || !validarInput(resultado)) {
        return res.redirect("/?mensaje=" + encodeURIComponent("❌ Entrada inválida al agregar experimento"));
    }
    pool.query(
        "INSERT INTO experimentos (numero_experimento, tipo_experimento, descripcion, resultado) VALUES ($1, $2, $3, $4)",
        [numero_experimento, tipo_experimento, sanitize(descripcion), sanitize(resultado)],
        (err) => {
            if (err) {
                console.error("❌ Error al agregar experimento:", err);
                return res.redirect("/?mensaje=" + encodeURIComponent("❌ Error en el servidor al agregar experimento"));
            }
            res.redirect("/?mensaje=" + encodeURIComponent("✅ Experimento registrado exitosamente"));
        }
    );
});

// Editar Experimento
app.post("/actualizarExperimento/:id", (req, res) => {
    const experimentoId = req.params.id;
    const { numero_experimento, tipo_experimento, descripcion, resultado } = req.body;

    if (!numero_experimento || !validarInput(descripcion) || !validarInput(resultado)) {
        return res.redirect("/?mensaje=" + encodeURIComponent("❌ Entrada inválida al editar experimento"));
    }

    pool.query(
        "UPDATE experimentos SET numero_experimento = $1, tipo_experimento = $2, descripcion = $3, resultado = $4 WHERE id = $5",
        [numero_experimento, tipo_experimento, sanitize(descripcion), sanitize(resultado), experimentoId],
        (err) => {
            if (err) {
                console.error("❌ Error al actualizar experimento:", err);
                return res.redirect("/?mensaje=" + encodeURIComponent("❌ Error al actualizar experimento"));
            }
            res.redirect("/?mensaje=" + encodeURIComponent("✅ Experimento editado exitosamente"));
        }
    );
});

// ─── SERVIDOR ─────────────────────────────────────────────
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor escuchando en el puerto ${PORT}`);
});