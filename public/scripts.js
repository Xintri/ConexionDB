// Verificar si el usuario ya está autenticado en index.html
document.addEventListener("DOMContentLoaded", () => {
    fetch('/session')
        .then(response => response.json())
        .then(data => {
            if (!data.loggedIn) {
                window.location.href = '/login.html';  // Redirigir si no está autenticado
            }
        });
});

// Verificar si el usuario ya está autenticado en login.html
document.addEventListener("DOMContentLoaded", () => {
    fetch('/session')
        .then(response => response.json())
        .then(data => {
            if (data.loggedIn) {
                window.location.href = '/';  // Redirigir al index si ya está autenticado
            }
        });
});
