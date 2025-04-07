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
        console.log("Sesión activa para el usuario:", req.session.user.username);
        res.sendFile(path.join(__dirname, "public", "index.html"));
    } else {
        console.log("No se encontró sesión activa. Redirigiendo a login.");
        res.redirect("/login.html");
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
        return res.redirect("/login.html");  // Si falta información, redirigir al login
    }

    pool.query(
        "SELECT * FROM usuarios WHERE username = $1",
        [username],
        (err, result) => {
            if (err) {
                console.error("Error al iniciar sesión:", err);
                return res.redirect("/login.html");  // Redirigir al login si hay un error
            }

            if (result.rows.length === 0) {
                return res.redirect("/login.html");  // Redirigir si el usuario no existe
            }

            const usuario = result.rows[0];

            if (usuario.password !== password) {
                return res.redirect("/login.html");  // Redirigir si la contraseña es incorrecta
            }

            req.session.user = {
                id: usuario.id,
                username: usuario.username,
                rol: usuario.rol
            };

            res.redirect("/");  // Redirigir al inicio si la sesión fue exitosa
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

// Obtener y mostrar los ángeles
app.get("/obtenerAngeles", (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ mensaje: "No autorizado" });  // Verifica si el usuario está autenticado
    }

    pool.query("SELECT * FROM angeles", (err, result) => {
        if (err) {
            console.error("❌ Error al obtener ángeles:", err);
            return res.status(500).send("Error al obtener ángeles");
        }

        // 🔥 Usar result.rows para generar la tabla dinámica
        let tablaAngeles = `
            <table class="table table-dark table-bordered table-hover text-center">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Nombre</th>
                        <th>Código</th>
                        <th>Jerarquía</th>
                        <th>Captura</th>
                        <th>Estado</th>
                        <th>Fecha de Registro</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>`;

        result.rows.forEach(angel => {
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
                        <a href="/">
                            <button class="btn btn-glitch w-100">Volver a Inicio</button>
                        </a>
                    </div>
                </div>
            </body>
            </html>
        `);
    });
});

// Ruta para ver la lista de ángeles
app.get("/verAngeles", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/login.html"); // Redirigir al login si no está autenticado
    }

    pool.query("SELECT * FROM angeles", (err, result) => {
        if (err) {
            console.error("Error al obtener ángeles:", err);
            return res.status(500).send("Error al obtener ángeles");
        }

        // Código HTML actualizado para la tabla de Ángeles
        let tablaAngeles = `
        <table class="table table-dark table-bordered table-hover text-center">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Nombre</th>
                    <th>Código</th>
                    <th>Jerarquía</th>
                    <th>Captura</th>
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
                        <a href="/">
                            <button class="btn btn-glitch w-100">Volver a Inicio</button>
                        </a>
                    </div>
                </div>
            </body>
            </html>
        `);
    });
});

// Ruta para editar un ángel (solo admins)
app.get("/editarAngel/:id", (req, res) => {
    if (!req.session.user || req.session.user.rol !== "admin") {
        return res.redirect("/login.html"); // Redirigir si no es admin o no está autenticado
    }

    const { id } = req.params;
    pool.query("SELECT * FROM angeles WHERE id = $1", [id], (err, result) => {
        if (err) {
            console.error("Error al obtener ángel:", err);
            return res.status(500).send("Error al obtener ángel");
        }
        if (result.rows.length === 0) {
            return res.status(404).send("Ángel no encontrado");
        }
        // Si se encuentra el ángel, mostrar formulario de edición
        const angel = result.rows[0];
        res.send(`
            <form action="/editarAngel" method="POST">
                <input type="hidden" name="id" value="${angel.id}">
                <input type="text" name="nombre" value="${angel.nombre}">
                <input type="text" name="codigo" value="${angel.codigo}">
                <input type="text" name="jerarquia" value="${angel.jerarquia}">
                <textarea name="captura">${angel.captura}</textarea>
                <input type="text" name="estado" value="${angel.estado}">
                <button type="submit">Actualizar Ángel</button>
            </form>
        `);
    });
});

// Ruta para actualizar los datos del ángel (solo admins)
app.post("/editarAngel", (req, res) => {
    if (!req.session.user || req.session.user.rol !== "admin") {
        return res.redirect("/login.html"); // Redirigir si no es admin o no está autenticado
    }

    const { id, nombre, codigo, jerarquia, captura, estado } = req.body;
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

// Ruta para eliminar un ángel (solo admins)
app.post("/eliminarAngel/:id", (req, res) => {
    if (!req.session.user || req.session.user.rol !== "admin") {
        return res.redirect("/login.html"); // Redirigir si no es admin o no está autenticado
    }

    const { id } = req.params;
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


// Obtener y mostrar los experimentos
app.get("/obtenerExperimentos", (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ mensaje: "No autorizado" });  // Verifica si el usuario está autenticado
    }

    pool.query("SELECT * FROM experimentos", (err, result) => {
        if (err) {
            console.error("❌ Error al obtener experimentos:", err);
            return res.status(500).send("Error al obtener experimentos");
        }

        // 🔥 Usar result.rows para generar la tabla dinámica
        let tablaExperimentos = `
            <table class="table table-dark table-bordered table-hover text-center">
                <thead>
                    <tr>
                        <th>Número</th>
                        <th>Tipo</th>
                        <th>Descripción</th>
                        <th>Resultado</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>`;

        result.rows.forEach(experiment => {
            tablaExperimentos += `
                <tr>
                    <td>${experiment.numero_experimento}</td>
                    <td>${experiment.tipo_experimento}</td>
                    <td>${experiment.descripcion}</td>
                    <td>${experiment.resultado}</td>
                    <td>
                        <a href="/editarExperimento/${experiment.id}" class="btn btn-warning btn-sm">Editar</a>
                        <a href="/eliminarExperimento/${experiment.id}" class="btn btn-danger btn-sm">Eliminar</a>
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
                        <a href="/">
                            <button class="btn btn-glitch w-100">Volver a Inicio</button>
                        </a>
                    </div>
                </div>
            </body>
            </html>
        `);
    });
});

// Ruta para ver la lista de experimentos
app.get("/verExperimentos", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/login.html"); // Redirigir al login si no está autenticado
    }

    pool.query("SELECT * FROM experimentos", (err, result) => {
        if (err) {
            console.error("Error al obtener experimentos:", err);
            return res.status(500).send("Error al obtener experimentos");
        }

        // Código HTML actualizado para la tabla de Experimentos
        let tablaExperimentos = `
        <table class="table table-dark table-bordered table-hover text-center">
            <thead>
                <tr>
                    <th>Número</th>
                    <th>Tipo</th>
                    <th>Descripción</th>
                    <th>Resultado</th>
                    <th>Acciones</th>
                </tr>
            </thead>
            <tbody>`;

        resultados.rows.forEach(experiment => {
        tablaExperimentos += `
            <tr>
                <td>${experiment.numero_experimento}</td>
                <td>${experiment.tipo_experimento}</td>
                <td>${experiment.descripcion}</td>
                <td>${experiment.resultado}</td>
                <td>
                    <a href="/editarExperimento/${experiment.id}" class="btn btn-warning btn-sm">Editar</a>
                    <a href="/eliminarExperimento/${experiment.id}" class="btn btn-danger btn-sm">Eliminar</a>
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
                        <a href="/">
                            <button class="btn btn-glitch w-100">Volver a Inicio</button>
                        </a>
                    </div>
                </div>
            </body>
            </html>
        `);
    });
});

// Ruta para editar un experimento (solo admins)
app.get("/editarExperimento/:id", (req, res) => {
    if (!req.session.user || req.session.user.rol !== "admin") {
        return res.redirect("/login.html"); // Redirigir si no es admin o no está autenticado
    }

    const { id } = req.params;
    pool.query("SELECT * FROM experimentos WHERE id = $1", [id], (err, result) => {
        if (err) {
            console.error("Error al obtener experimento:", err);
            return res.status(500).send("Error al obtener experimento");
        }
        if (result.rows.length === 0) {
            return res.status(404).send("Experimento no encontrado");
        }
        // Si se encuentra el experimento, mostrar formulario de edición
        const experiment = result.rows[0];
        res.send(`
            <form action="/editarExperimento" method="POST">
                <input type="hidden" name="id" value="${experiment.id}">
                <input type="text" name="numero_experimento" value="${experiment.numero_experimento}">
                <input type="text" name="tipo_experimento" value="${experiment.tipo_experimento}">
                <textarea name="descripcion">${experiment.descripcion}</textarea>
                <textarea name="resultado">${experiment.resultado}</textarea>
                <button type="submit">Actualizar Experimento</button>
            </form>
        `);
    });
});

// Ruta para actualizar los datos del experimento (solo admins)
app.post("/editarExperimento", (req, res) => {
    if (!req.session.user || req.session.user.rol !== "admin") {
        return res.redirect("/login.html"); // Redirigir si no es admin o no está autenticado
    }

    const { id, numero_experimento, tipo_experimento, descripcion, resultado } = req.body;
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

// Ruta para eliminar un experimento (solo admins)
app.post("/eliminarExperimento/:id", (req, res) => {
    if (!req.session.user || req.session.user.rol !== "admin") {
        return res.redirect("/login.html"); // Redirigir si no es admin o no está autenticado
    }

    const { id } = req.params;
    pool.query("DELETE FROM experimentos WHERE id = $1", [id], (err) => {
        if (err) {
            console.error("Error al eliminar experimento:", err);
            return res.status(500).send("Error al eliminar experimento");
        }
        res.redirect("/verExperimentos");
    });
});



// 🔥 RUTAS SOLO PARA ADMIN 🔥

// Obtener usuarios (para mostrar en la tabla)
app.get("/obtenerUsuarios", (req, res) => {
    if (!req.session.user || req.session.user.rol !== "admin") {
        return res.redirect("/login.html");  // Redirigir al login si no está autenticado o no es admin
    }

    pool.query("SELECT id, username, rol FROM usuarios", (err, result) => {
        if (err) {
            console.error("Error al obtener usuarios:", err);
            return res.status(500).json({ mensaje: "Error al obtener usuarios" });
        }

        // Código HTML actualizado para la tabla de Usuarios
        let tablaUsuarios = `
        <table class="table table-dark table-bordered table-hover text-center">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Nombre de Usuario</th>
                    <th>Rol</th>
                    <th>Acciones</th>
                </tr>
            </thead>
            <tbody>`;

        resultados.rows.forEach(user => {
        tablaUsuarios += `
            <tr>
                <td>${user.id}</td>
                <td>${user.username}</td>
                <td>${user.rol}</td>
                <td>
                    <a href="/editarUsuario/${user.id}" class="btn btn-warning btn-sm">Editar</a>
                    <a href="/eliminarUsuario/${user.id}" class="btn btn-danger btn-sm">Eliminar</a>
                </td>
            </tr>`;
        });

        tablaUsuarios += `</tbody></table>`;

        res.send(`
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Usuarios Registrados</title>
                <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
                <link rel="stylesheet" href="/styles.css">
            </head>
            <body class="min-vh-100">
                <div class="container text-center">
                    <h2 class="glitch">Lista de Usuarios Registrados</h2>
                    ${tablaUsuarios}
                    <div class="mt-4">
                        <a href="/">
                            <button class="btn btn-glitch w-100">Volver a Inicio</button>
                        </a>
                    </div>
                </div>
            </body>
            </html>
        `);
    });
});

// Ruta para ver la lista de usuarios (solo admins)
app.get("/verUsuarios", (req, res) => {
    if (!req.session.user || req.session.user.rol !== "admin") {
        return res.redirect("/login.html");  // Redirigir al login si no está autenticado o no es admin
    }

    // Obtener los usuarios
    pool.query("SELECT id, username, rol FROM usuarios", (err, result) => {
        if (err) {
            console.error("Error al obtener usuarios:", err);
            return res.status(500).send("Error al obtener usuarios");
        }

        // Pasar los datos de los usuarios y el rol al HTML
        res.send(`
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Usuarios Registrados</title>
                <link rel="stylesheet" href="/styles.css">
            </head>
            <body>
                <h1>Usuarios Registrados</h1>
                ${req.session.user.rol === "admin" ? `
                    <a href="/verUsuarios">
                        <button class="btn btn-primary">Ver Usuarios</button>
                    </a>
                ` : ''}
                <table>
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Nombre de Usuario</th>
                            <th>Rol</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${result.rows.map(user => `
                            <tr>
                                <td>${user.id}</td>
                                <td>${user.username}</td>
                                <td>${user.rol}</td>
                                <td>
                                    <button class="btn btn-warning">Editar</button>
                                    <button class="btn btn-danger">Eliminar</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <hr>
                <a href="/logout"><button class="btn btn-danger">Cerrar sesión</button></a>
            </body>
            </html>
        `);
    });
});

// Ruta para editar un usuario (solo admins)
app.get("/editarUsuario/:id", (req, res) => {
    if (!req.session.user || req.session.user.rol !== "admin") {
        return res.redirect("/login.html"); // Redirigir si no es admin o no está autenticado
    }

    const { id } = req.params;
    pool.query("SELECT * FROM usuarios WHERE id = $1", [id], (err, result) => {
        if (err) {
            console.error("Error al obtener usuario:", err);
            return res.status(500).send("Error al obtener usuario");
        }
        if (result.rows.length === 0) {
            return res.status(404).send("Usuario no encontrado");
        }
        // Si se encuentra el usuario, mostrar formulario de edición
        const user = result.rows[0];
        res.send(`
            <form action="/editarUsuario" method="POST">
                <input type="hidden" name="id" value="${user.id}">
                <input type="text" name="username" value="${user.username}">
                <select name="rol">
                    <option value="admin" ${user.rol === "admin" ? "selected" : ""}>Admin</option>
                    <option value="user" ${user.rol === "user" ? "selected" : ""}>User</option>
                </select>
                <button type="submit">Actualizar Usuario</button>
            </form>
        `);
    });
});

// Ruta para actualizar los datos del usuario (solo admins)
app.post("/editarUsuario", (req, res) => {
    if (!req.session.user || req.session.user.rol !== "admin") {
        return res.redirect("/login.html"); // Redirigir si no es admin o no está autenticado
    }

    const { id, username, rol } = req.body;
    pool.query(
        "UPDATE usuarios SET username = $1, rol = $2 WHERE id = $3",
        [username, rol, id],
        (err) => {
            if (err) {
                console.error("Error al editar usuario:", err);
                return res.status(500).send("Error al editar usuario");
            }
            res.redirect("/verUsuarios");
        }
    );
});

// Ruta para eliminar un usuario (solo admins)
app.post("/eliminarUsuario/:id", (req, res) => {
    if (!req.session.user || req.session.user.rol !== "admin") {
        return res.redirect("/login.html"); // Redirigir si no es admin o no está autenticado
    }

    const { id } = req.params;
    pool.query("DELETE FROM usuarios WHERE id = $1", [id], (err) => {
        if (err) {
            console.error("Error al eliminar usuario:", err);
            return res.status(500).send("Error al eliminar usuario");
        }
        res.redirect("/verUsuarios");
    });
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
});