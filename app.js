const express = require('express');
const bodyParser = require("body-parser");
const path = require('path');
const { Pool } = require("pg");
const session = require('express-session');
require("dotenv").config();

const app = express();

// ⚠️ Verifica que DB_HOST sea el correcto, debería ser el **External Database URL** de Render
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 5432,
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false
});

// ✅ Verificar conexión a la base de datos antes de iniciar el servidor
pool.connect()
    .then(() => console.log("✅ Conectado a la BD en Render"))
    .catch(err => {
        console.error("❌ Error al conectar a la BD:", err);
        process.exit(1);
    });

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

// Configuración de sesión
app.use(session({
    secret: process.env.SESSION_SECRET || 'secret_key_default',
    resave: false,
    saveUninitialized: false,
}));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Middleware para proteger rutas (requiere sesión)
function requireLogin(req, res, next) {
    if (req.session && req.session.user) {
        next();
    } else {
        res.redirect("/login");
    }
}

// ─── RUTAS DE INICIO DE SESIÓN ─────────────────────────────────────────────

// Ruta para mostrar el formulario de login
app.get("/login", (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Iniciar Sesión</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    </head>
    <body class="container">
        <h2>Iniciar Sesión</h2>
        <form action="/login" method="post">
            <div class="mb-3">
                <label for="username">Usuario:</label>
                <input type="text" name="username" id="username" class="form-control" required>
            </div>
            <div class="mb-3">
                <label for="password">Contraseña:</label>
                <input type="password" name="password" id="password" class="form-control" required>
            </div>
            <input type="submit" value="Iniciar Sesión" class="btn btn-primary">
        </form>
    </body>
    </html>
    `);
});

// Ruta para procesar el login
app.post("/login", (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).send("Falta usuario o contraseña");
    }
    pool.query("SELECT * FROM usuarios WHERE username = $1", [username], (err, result) => {
        if (err) {
            console.error("Error en login:", err);
            return res.status(500).send("Error en el servidor");
        }
        if (result.rows.length === 0) {
            return res.status(401).send("Usuario no encontrado");
        }
        const usuario = result.rows[0];
        // Comparación simple de contraseñas (no recomendado para producción, utiliza hashing)
        if (usuario.password !== password) {
            return res.status(401).send("Contraseña incorrecta");
        }
        req.session.user = {
            id: usuario.id,
            username: usuario.username
        };
        res.redirect("/obtenerAngeles");
    });
});

// Ruta para cerrar sesión
app.get("/logout", (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error("Error al cerrar sesión", err);
        }
        res.redirect("/login");
    });
});

// ─── RUTA RAÍZ ────────────────────────────────────────────────────────────────
// Si el usuario está logueado, redirige a /obtenerAngeles; de lo contrario a /login.
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// ─── Funciones de Sanitización ───────────────────────────────────────────────
function validarInput(input) {
    return !/[<>]/.test(input); // Evita los caracteres '<' y '>'
}

function sanitize(value) {
    return value.replace(/[<>]/g, ""); // Reemplaza "<" y ">" por nada
}
// ─── LOGS ─────────────────────────────────────────────────────
app.post("/register", (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).send("Falta usuario o contraseña");
    }

    pool.query("INSERT INTO usuarios (username, password) VALUES ($1, $2)", [username, password], (err) => {
        if (err) {
            console.error("❌ Error al registrar:", err);
            return res.status(500).send("Error en el servidor");
        }

        req.session.user = { username };
        req.session.message = "✅ Usuario registrado con éxito";
        res.redirect("/index.html?exito=1");
    });
});

app.post("/login", (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).send("Falta usuario o contraseña");
    }

    pool.query("SELECT * FROM usuarios WHERE username = $1", [username], (err, result) => {
        if (err) {
            console.error("Error en login:", err);
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
            username: usuario.username
        };

        req.session.message = "✅ Inicio de sesión exitoso";
        res.redirect("/index.html?exito=1");
    });
});

// ─── RUTAS PARA ÁNGELES ─────────────────────────────────────────────────────

app.post("/agregarAngel", requireLogin, (req, res) => {
    let { nombre, codigo, jerarquia, captura, estado } = req.body;
    if (!validarInput(nombre) || !validarInput(codigo) || !validarInput(captura) || !validarInput(estado)) {
        return res.status(400).send({ error: "Error: Entrada inválida. No se permiten los caracteres < y >." });
    }
    pool.query(
        "INSERT INTO angeles (nombre, codigo, jerarquia, captura, estado) VALUES ($1, $2, $3, $4, $5)",
        [sanitize(nombre), sanitize(codigo), jerarquia, sanitize(captura), estado],
        (err) => {
            if (err) {
                console.error("❌ Error al agregar ángel:", err);
                return res.status(500).send({ error: "Error en el servidor." });
            }
            res.redirect("/obtenerAngeles");
        }
    );
});

app.get("/obtenerAngeles", requireLogin, (req, res) => {
    pool.query("SELECT * FROM angeles", (err, resultados) => {
        if (err) {
            console.error("❌ Error al obtener ángeles:", err);
            return res.status(500).send("Error en el servidor.");
        }
        if (!resultados || !resultados.rows) {
            console.error("⚠️ No hay datos en la consulta.");
            return res.status(500).send("Error: No hay datos en la consulta.");
        }
        let tablaAngeles = `
            <table class="table table-dark table-bordered table-hover text-center">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Nombre</th>
                        <th>Código</th>
                        <th>Jerarquía</th>
                        <th class="col-lg-4">Captura</th>
                        <th>Estado</th>
                        <th>Fecha de Registro</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>`;
        resultados.rows.forEach(angel => {
            tablaAngeles += `
                <tr>
                    <td>${angel.id}</td>
                    <td>${angel.nombre}</td>
                    <td>${angel.codigo}</td>
                    <td>${angel.jerarquia}</td>
                    <td>${angel.captura}</td>
                    <td>${angel.estado}</td>
                    <td>${angel.fecha_registro}</td>
                    <td>
                        <a href="/editarAngel/${angel.id}" class="btn btn-warning btn-sm">Editar</a>
                        <a href="/eliminarAngel/${angel.id}" class="btn btn-danger btn-sm">Eliminar</a>
                    </td>
                </tr>`;
        });
        tablaAngeles += `</tbody></table>`;
        res.send(`
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Ángeles Registrados</title>
                <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
                <link rel="stylesheet" href="/styles.css">
            </head>
            <body class="min-vh-100">
                <div class="container text-center">
                    <h2 class="glitch">Lista de Ángeles Registrados</h2>
                    ${tablaAngeles}
                    <div class="mt-4">
                        <a href="/logout"><button class="btn btn-glitch w-100">Cerrar Sesión</button></a>
                    </div>
                </div>
            </body>
            </html>
        `);
    });
});

app.get("/editarAngel/:id", requireLogin, (req, res) => {
    const angelId = req.params.id;
    pool.query("SELECT * FROM angeles WHERE id = $1", [angelId], (err, resultados) => {
        if (err) {
            console.error("Error al obtener el ángel:", err);
            return res.status(500).send("Error en el servidor.");
        }
        if (resultados.rows.length === 0) {
            return res.status(404).send("Ángel no encontrado.");
        }
        const angel = resultados.rows[0];
        res.send(`
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Editar Ángel</title>
                <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
                <link rel="stylesheet" href="/styles.css">
            </head>
            <body>
                <div class="container text-center">
                    <h2 class="glitch">Editar Ángel</h2>
                    <form action="/actualizarAngel/${angel.id}" method="post">
                        <input type="text" name="nombre" value="${angel.nombre}" class="form-control mb-2" required>
                        <input type="text" name="codigo" value="${angel.codigo}" class="form-control mb-2" required>
                        <select name="jerarquia" class="form-control mb-2" required>
                            <option value="${angel.jerarquia}" selected>${angel.jerarquia}</option>
                            <option value="Serafín">Serafín</option>
                            <option value="Querubín">Querubín</option>
                            <option value="Trono">Trono</option>
                            <option value="Dominación">Dominación</option>
                            <option value="Virtud">Virtud</option>
                            <option value="Potestad">Potestad</option>
                            <option value="Principado">Principado</option>
                            <option value="Arcángel">Arcángel</option>
                            <option value="Ángel">Ángel</option>
                        </select>
                        <input type="text" name="captura" value="${angel.captura}" class="form-control mb-2" required>
                        <select name="estado" class="form-control mb-3" required>
                            <option value="${angel.estado}" selected>${angel.estado}</option>
                            <option value="Contenido">Contenido</option>
                            <option value="Neutralizado">Neutralizado</option>
                            <option value="En cuarentena">En cuarentena</option>
                            <option value="Desaparecido">Desaparecido</option>
                        </select>
                        <input type="submit" value="Actualizar" class="btn btn-glitch w-100">
                    </form>
                    <a href="/obtenerAngeles">
                        <button class="btn btn-glitch w-100">Cancelar</button>
                    </a>
                </div>
            </body>
            </html>
        `);
    });
});

app.post("/actualizarAngel/:id", requireLogin, (req, res) => {
    const angelId = req.params.id;
    const { nombre, codigo, jerarquia, captura, estado } = req.body;
    if (!validarInput(nombre) || !validarInput(codigo) || !validarInput(captura) || !validarInput(estado)) {
        return res.status(400).send({ error: "Error: Entrada inválida. No se permiten los caracteres < y >." });
    }
    pool.query(
        "UPDATE angeles SET nombre = $1, codigo = $2, jerarquia = $3, captura = $4, estado = $5 WHERE id = $6",
        [sanitize(nombre), sanitize(codigo), jerarquia, sanitize(captura), sanitize(estado), angelId],
        (err) => {
            if (err) {
                console.error("Error al actualizar el ángel:", err);
                return res.status(500).send("Error al actualizar el ángel.");
            }
            res.redirect("/obtenerAngeles");
        }
    );
});

app.get("/eliminarAngel/:id", requireLogin, (req, res) => {
    const angelId = req.params.id;
    pool.query("DELETE FROM angeles WHERE id = $1", [angelId], (err) => {
        if (err) {
            console.error("Error al eliminar el ángel:", err);
            return res.status(500).send("Error al eliminar el ángel.");
        }
        res.redirect("/obtenerAngeles");
    });
});

// ─── RUTAS PARA EXPERIMENTOS ───────────────────────────────────────────────

app.get("/registrarExperimento", requireLogin, (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Registrar Experimento</title>
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
            <link rel="stylesheet" href="/styles.css">
        </head>
        <body>
            <div class="container text-center">
                <h2 class="glitch">Registrar Experimento</h2>
                <form action="/agregarExperimento" method="post">
                    <input type="number" name="numero_experimento" placeholder="Número del Experimento" class="form-control mb-2" required>
                    <select name="tipo_experimento" class="form-control mb-2" required>
                        <option value="">-- Tipo de Experimento --</option>
                        <option value="Resistencia">Resistencia</option>
                        <option value="Manipulación Mental">Manipulación Mental</option>
                        <option value="Interacción Física">Interacción Física</option>
                        <option value="Lenguaje Angélico">Lenguaje Angélico</option>
                        <option value="Otros">Otros</option>
                    </select>
                    <input type="text" name="descripcion" placeholder="Descripción del experimento" class="form-control mb-2" required>
                    <input type="text" name="resultado" placeholder="Resultado del experimento" class="form-control mb-2" required>
                    <input type="submit" value="Registrar" class="btn btn-glitch w-100">
                </form>
            </div>
        </body>
        </html>
    `);
});

app.post("/agregarExperimento", requireLogin, (req, res) => {
    let { numero_experimento, tipo_experimento, descripcion, resultado } = req.body;
    if (!numero_experimento || !validarInput(descripcion) || !validarInput(resultado)) {
        return res.status(400).send({ error: "Error: Debes completar todos los campos." });
    }
    pool.query(
        "INSERT INTO experimentos (numero_experimento, tipo_experimento, descripcion, resultado) VALUES ($1, $2, $3, $4)",
        [numero_experimento, tipo_experimento, sanitize(descripcion), sanitize(resultado)],
        (err) => {
            if (err) {
                console.error("❌ Error al agregar el experimento:", err);
                return res.status(500).send({ error: "Error al insertar el experimento en la base de datos.", details: err });
            }
            res.redirect("/obtenerExperimentos");
        }
    );
});

app.get("/obtenerExperimentos", requireLogin, (req, res) => {
    pool.query("SELECT * FROM experimentos", (err, resultados) => {
        if (err) {
            console.error("Error al obtener experimentos:", err);
            return res.status(500).send("Error en el servidor.");
        }
        let tablaExperimentos = `
            <table class="table table-dark table-bordered table-hover text-center">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Número del Experimento</th>
                        <th>Tipo de Experimento</th>
                        <th>Descripción</th>
                        <th>Resultado</th>
                        <th>Fecha</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>`;
        resultados.rows.forEach(experimento => {
            tablaExperimentos += `
                <tr>
                    <td>${experimento.id}</td>
                    <td>${experimento.numero_experimento}</td>
                    <td>${experimento.tipo_experimento}</td>
                    <td>${experimento.descripcion}</td>
                    <td>${experimento.resultado}</td>
                    <td>${experimento.fecha}</td>
                    <td>
                        <a href="/editarExperimento/${experimento.id}" class="btn btn-warning btn-sm">Editar</a>
                        <a href="/eliminarExperimento/${experimento.id}" class="btn btn-danger btn-sm">Eliminar</a>
                    </td>
                </tr>`;
        });
        tablaExperimentos += `</tbody></table>`;
        res.send(`
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Experimentos Registrados</title>
                <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
                <link rel="stylesheet" href="/styles.css">
            </head>
            <body class="min-vh-100">
                <div class="container text-center">
                    <h2 class="glitch">Lista de Experimentos Registrados</h2>
                    ${tablaExperimentos}
                    <div class="mt-4">
                        <a href="/logout"><button class="btn btn-glitch w-100">Cerrar Sesión</button></a>
                    </div>
                </div>
            </body>
            </html>
        `);
    });
});

app.get("/editarExperimento/:id", requireLogin, (req, res) => {
    const experimentoId = req.params.id;
    pool.query("SELECT * FROM experimentos WHERE id = $1", [experimentoId], (err, resultados) => {
        if (err) {
            console.error("Error al obtener el experimento:", err);
            return res.status(500).send("Error al obtener el experimento.");
        }
        if (!resultados.rows || resultados.rows.length === 0) {
            return res.status(404).send("Experimento no encontrado.");
        }
        const experimento = resultados.rows[0];
        res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Editar Experimento</title>
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
            <link rel="stylesheet" href="/styles.css">
        </head>
        <body>
            <div class="container text-center">
                <h2 class="glitch">Editar Experimento</h2>
                <form action="/actualizarExperimento/${experimento.id}" method="post">
                    <input type="number" name="numero_experimento" value="${experimento.numero_experimento || ''}" class="form-control mb-2" required>
                    <select name="tipo_experimento" class="form-control mb-2" required>
                        <option value="${experimento.tipo_experimento}" selected>${experimento.tipo_experimento}</option>
                        <option value="Resistencia">Resistencia</option>
                        <option value="Manipulación Mental">Manipulación Mental</option>
                        <option value="Interacción Física">Interacción Física</option>
                        <option value="Lenguaje Angélico">Lenguaje Angélico</option>
                        <option value="Otros">Otros</option>
                    </select>
                    <input type="text" name="descripcion" value="${experimento.descripcion || ''}" class="form-control mb-2" required>
                    <input type="text" name="resultado" value="${experimento.resultado || ''}" class="form-control mb-2" required>
                    <input type="submit" value="Actualizar" class="btn btn-glitch w-100">
                </form>
                <a href="/obtenerExperimentos">
                    <button class="btn btn-glitch w-100">Cancelar</button>
                </a>
            </div>
        </body>
        </html>
    `);
    });
});

app.post("/actualizarExperimento/:id", requireLogin, (req, res) => {
    const experimentoId = req.params.id;
    const { numero_experimento, tipo_experimento, descripcion, resultado } = req.body;
    pool.query(
        "UPDATE experimentos SET numero_experimento = $1, tipo_experimento = $2, descripcion = $3, resultado = $4 WHERE id = $5",
        [numero_experimento, tipo_experimento, sanitize(descripcion), sanitize(resultado), experimentoId],
        (err) => {
            if (err) {
                console.error("Error al actualizar el experimento:", err);
                return res.status(500).send("Error al actualizar el experimento.");
            }
            res.redirect("/obtenerExperimentos");
        }
    );
});

app.get("/eliminarExperimento/:id", requireLogin, (req, res) => {
    const experimentoId = req.params.id;
    pool.query("DELETE FROM experimentos WHERE id = $1", [experimentoId], (err) => {
        if (err) {
            console.error("Error al eliminar el experimento:", err);
            return res.status(500).send("Error al eliminar el experimento.");
        }
        res.redirect("/obtenerExperimentos");
    });
});

// ─── Servidor corriendo ──────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(10000, () => {
    console.log('🚀 Servidor escuchando en el puerto 10000');
});
