const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const session = require('express-session');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();

// Configurar conexión a PostgreSQL
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 5432,
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false
});

// Middlewares
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
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

// Función para enviar respuesta con redirección y alerta
function enviarAlerta(res, mensaje, exito = true) {
    res.redirect(`/?mensaje=${encodeURIComponent(mensaje)}&exito=${exito}`);
}

// Mostrar la página de login o index
app.get("/", (req, res) => {
    if (req.session.user) {
        // Si el usuario está autenticado, mostrar el index
        res.sendFile(path.join(__dirname, "public", "index.html"));
    } else {
        // Si el usuario no está autenticado, redirigir al login
        res.sendFile(path.join(__dirname, "public", "login.html"));
    }
});

// Verificar sesión en la ruta /session
app.get("/session", (req, res) => {
    if (req.session.user) {
        res.json({
            loggedIn: true,
            username: req.session.user.username,
            rol: req.session.user.rol
        });
    } else {
        res.json({ loggedIn: false });
    }
});

// Obtener datos de sesión
app.get("/session", (req, res) => {
    if (req.session.user) {
        res.json({
            loggedIn: true,
            username: req.session.user.username,
            rol: req.session.user.rol
        });
    } else {
        res.json({ loggedIn: false });
    }
});

// Registro
app.post("/register", (req, res) => {
    const { username, password, admin_key } = req.body;

    // Verificar que los campos esenciales están presentes
    if (!username || !password) {
        return enviarAlerta(res, "Faltan datos en el registro", false);
    }

    // Validar que los datos no contienen palabras o caracteres peligrosos
    if (!validarInput(username) || !validarInput(password)) {
        return enviarAlerta(res, "Datos inválidos", false);
    }

    // Asignar rol dependiendo de la clave admin_key
    const rol = (admin_key === process.env.ADMIN_KEY) ? "admin" : "user"; // Verificar si es admin o usuario

    // Insertar usuario en la base de datos
    pool.query(
        "INSERT INTO usuarios (username, password, rol) VALUES ($1, $2, $3)",
        [sanitize(username), sanitize(password), rol], // Sanitize inputs
        (err) => {
            if (err) {
                console.error("Error al registrar:", err);
                return enviarAlerta(res, "Error al registrar usuario", false);
            }

            // Asignar la sesión para el usuario registrado
            req.session.user = { username, rol };  // Asignar la sesión con el rol correspondiente

            // Enviar alerta de registro exitoso
            enviarAlerta(res, "Registro exitoso");
        }
    );
});


// Login
app.post("/login", (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return enviarAlerta(res, "Faltan datos en login", false);
    }

    pool.query(
        "SELECT * FROM usuarios WHERE username = $1",
        [username],
        (err, result) => {
        if (err) {
            console.error("Error al iniciar sesión:", err);
            return enviarAlerta(res, "Error en el servidor", false);
        }

        if (result.rows.length === 0) {
            return enviarAlerta(res, "Usuario no encontrado", false);
        }

        const usuario = result.rows[0];

        if (usuario.password !== password) {
            return enviarAlerta(res, "Contraseña incorrecta", false);
        }

        req.session.user = {
            id: usuario.id,
            username: usuario.username,
            rol: usuario.rol
        };

        enviarAlerta(res, "Inicio de sesión exitoso");
        }
    );
});

// Logout
app.get("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.redirect("/");  // En caso de error al destruir la sesión, redirigir al home
        }
        res.redirect("/login.html");  // Redirigir al login después de cerrar sesión
    });
});


// ---- Rutas para usuarios normales y admins ----

// Añadir Ángel
app.post("/agregarAngel", (req, res) => {
    if (!req.session.user) return enviarAlerta(res, "No autorizado", false);

    const { nombre, codigo, jerarquia, captura, estado } = req.body;
    if (!nombre || !codigo || !jerarquia || !captura || !estado) {
        return enviarAlerta(res, "Faltan datos para registrar ángel", false);
    }

    pool.query(
        "INSERT INTO angeles (nombre, codigo, jerarquia, captura, estado) VALUES ($1, $2, $3, $4, $5)",
        [sanitize(nombre), sanitize(codigo), sanitize(jerarquia), sanitize(captura), sanitize(estado)],
        (err) => {
        if (err) {
            console.error("Error al agregar ángel:", err);
            return enviarAlerta(res, "Error al registrar ángel", false);
        }
        enviarAlerta(res, "Ángel registrado exitosamente");
        }
    );
});

// Editar Ángel
app.post("/editarAngel", (req, res) => {
    if (!req.session.user) return enviarAlerta(res, "No autorizado", false);

    const { id, nombre, codigo, jerarquia, captura, estado } = req.body;
    if (!id || !nombre || !codigo || !jerarquia || !captura || !estado) {
        return enviarAlerta(res, "Faltan datos para editar ángel", false);
    }

    pool.query(
        "UPDATE angeles SET nombre = $1, codigo = $2, jerarquia = $3, captura = $4, estado = $5 WHERE id = $6",
        [sanitize(nombre), sanitize(codigo), sanitize(jerarquia), sanitize(captura), sanitize(estado), id],
        (err) => {
            if (err) {
                console.error("Error al editar ángel:", err);
                return enviarAlerta(res, "Error al editar ángel", false);
            }
            enviarAlerta(res, "Ángel editado exitosamente");
        }
    );
});

// Ruta para ver la lista de Angeles
app.get("/verAngeles", (req, res) => {
    if (!req.session.user || req.session.user.rol !== "admin") {
        return res.redirect("/login.html");  // Redirigir al login si no está autenticado o no es admin
    }
    res.sendFile(path.join(__dirname, "public", "verAngeles.html"));  // Asegúrate de que la ruta sea correcta
});


// Ruta para editar un ángel
app.post("/editarAngel", (req, res) => {
    const { id, nombre, codigo, jerarquia, captura, estado } = req.body;
    if (!id || !nombre || !codigo || !jerarquia || !captura || !estado) {
        return res.status(400).send("Faltan datos para editar el ángel");
    }

    pool.query(
        "UPDATE angeles SET nombre = $1, codigo = $2, jerarquia = $3, captura = $4, estado = $5 WHERE id = $6",
        [nombre, codigo, jerarquia, captura, estado, id],
        (err) => {
            if (err) {
                console.error("Error al editar ángel:", err);
                return res.status(500).send("Error al editar ángel");
            }
            res.redirect("/verAngeles");
        }
    );
});

// Ruta para eliminar un ángel
app.post("/eliminarAngel", (req, res) => {
    const { id } = req.body;

    pool.query("DELETE FROM angeles WHERE id = $1", [id], (err) => {
        if (err) {
            console.error("Error al eliminar ángel:", err);
            return res.status(500).send("Error al eliminar ángel");
        }
        res.redirect("/verAngeles");
    });
});



// Añadir Experimento
app.post("/agregarExperimento", (req, res) => {
    if (!req.session.user) return enviarAlerta(res, "No autorizado", false);

    const { numero_experimento, tipo_experimento, descripcion, resultado } = req.body;
    if (!numero_experimento || !tipo_experimento || !descripcion || !resultado) {
        return enviarAlerta(res, "Faltan datos para registrar experimento", false);
    }

    pool.query(
        "INSERT INTO experimentos (numero_experimento, tipo_experimento, descripcion, resultado) VALUES ($1, $2, $3, $4)",
        [numero_experimento, sanitize(tipo_experimento), sanitize(descripcion), sanitize(resultado)],
        (err) => {
            if (err) {
                console.error("Error al agregar experimento:", err);
                return enviarAlerta(res, "Error al registrar experimento", false);
            }
            enviarAlerta(res, "Experimento registrado exitosamente");
        }
    );
});

// Editar Experimento
app.post("/editarExperimento", (req, res) => {
    if (!req.session.user) return enviarAlerta(res, "No autorizado", false);

    const { id, numero_experimento, tipo_experimento, descripcion, resultado } = req.body;
    if (!id || !numero_experimento || !tipo_experimento || !descripcion || !resultado) {
        return enviarAlerta(res, "Faltan datos para editar experimento", false);
    }

    pool.query(
        "UPDATE experimentos SET numero_experimento = $1, tipo_experimento = $2, descripcion = $3, resultado = $4 WHERE id = $5",
        [numero_experimento, sanitize(tipo_experimento), sanitize(descripcion), sanitize(resultado), id],
        (err) => {
            if (err) {
                console.error("Error al editar experimento:", err);
                return enviarAlerta(res, "Error al editar experimento", false);
            }
            enviarAlerta(res, "Experimento editado exitosamente");
        }
    );
});

// Obtener y mostrar los experimentos
app.get("/obtenerExperimentos", (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ mensaje: "No autorizado" });  // Verifica si el usuario está autenticado
    }

    pool.query("SELECT * FROM experimentos", (err, result) => {
        if (err) {
            console.error("Error al obtener experimentos:", err);
            return res.status(500).json({ mensaje: "Error al obtener experimentos" });
        }
        res.json(result.rows);  // Devuelve los datos de los experimentos
    });
});

// Ruta para ver la lista de Experimentos
app.get("/verExperimentos", (req, res) => {
    if (!req.session.user || req.session.user.rol !== "admin") {
        return res.redirect("/login.html");  // Redirigir al login si no está autenticado o no es admin
    }
    res.sendFile(path.join(__dirname, "public", "verExperimentos.html"));  // Asegúrate de que la ruta sea correcta
});

// Ruta para editar un experimento
app.post("/editarExperimento", (req, res) => {
    const { id, numero_experimento, tipo_experimento, descripcion, resultado } = req.body;
    if (!id || !numero_experimento || !tipo_experimento || !descripcion || !resultado) {
        return res.status(400).send("Faltan datos para editar el experimento");
    }

    pool.query(
        "UPDATE experimentos SET numero_experimento = $1, tipo_experimento = $2, descripcion = $3, resultado = $4 WHERE id = $5",
        [numero_experimento, tipo_experimento, descripcion, resultado, id],
        (err) => {
            if (err) {
                console.error("Error al editar experimento:", err);
                return res.status(500).send("Error al editar experimento");
            }
            res.redirect("/verExperimentos");
        }
    );
});

// Ruta para eliminar un experimento
app.post("/eliminarExperimento", (req, res) => {
    const { id } = req.body;

    pool.query("DELETE FROM experimentos WHERE id = $1", [id], (err) => {
        if (err) {
            console.error("Error al eliminar experimento:", err);
            return res.status(500).send("Error al eliminar experimento");
        }
        res.redirect("/verExperimentos");
    });
});


// 🔥 RUTAS SOLO PARA ADMIN 🔥

// Ruta para ver la lista de usuarios (solo admin)
app.get("/verUsuarios", (req, res) => {
    if (!req.session.user || req.session.user.rol !== "admin") {
        return res.redirect("/login.html");  // Redirigir al login si no está autenticado o no es admin
    }
    res.sendFile(path.join(__dirname, "public", "verUsuarios.html"));  // Asegúrate de que la ruta sea correcta
});


// Editar Usuario (solo admins)
app.post("/editarUsuario", (req, res) => {
    if (!req.session.user || req.session.user.rol !== "admin") {
        return enviarAlerta(res, "Acceso denegado", false);
    }

    const { id, username, rol } = req.body;
    if (!id || !username || !rol) {
        return enviarAlerta(res, "Faltan datos para editar usuario", false);
    }

    pool.query(
        "UPDATE usuarios SET username = $1, rol = $2 WHERE id = $3",
        [sanitize(username), sanitize(rol), id],
        (err) => {
            if (err) {
                console.error("Error al editar usuario:", err);
                return enviarAlerta(res, "Error al editar usuario", false);
            }
            enviarAlerta(res, "Usuario editado exitosamente");
        }
    );
});

// Eliminar Usuario (solo admins)
app.post("/eliminarUsuario", (req, res) => {
    if (!req.session.user || req.session.user.rol !== "admin") {
        return enviarAlerta(res, "Acceso denegado", false);
    }

    const { id } = req.body;
    if (!id) {
        return enviarAlerta(res, "Falta ID para eliminar usuario", false);
    }

    pool.query(
        "DELETE FROM usuarios WHERE id = $1",
        [id],
        (err) => {
            if (err) {
                console.error("Error al eliminar usuario:", err);
                return enviarAlerta(res, "Error al eliminar usuario", false);
            }
            enviarAlerta(res, "Usuario eliminado exitosamente");
        }
    );
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
});