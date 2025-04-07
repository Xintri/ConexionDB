document.addEventListener("DOMContentLoaded", () => {
    // Verificar si el usuario está autenticado
    fetch('/session')
        .then(response => response.json())
        .then(data => {
            // Redirigir si no está autenticado y no estamos en la página de login
            if (!data.loggedIn && window.location.pathname !== '/login.html') {
                window.location.href = '/login.html';
            }

            // Redirigir si ya está autenticado y estamos en login.html
            if (data.loggedIn && window.location.pathname !== '/') {
                window.location.href = '/';
            }

            // Ocultar la sección de "Ver Usuarios" si el rol no es admin
            if (data.rol !== 'admin') {
                const usersSection = document.getElementById('usersSection');
                if (usersSection) {
                    usersSection.style.display = 'none';  // Ocultar la sección de usuarios
                }
            }
        });

    // Obtener y mostrar los ángeles
    fetch('/obtenerAngeles')
        .then(response => response.json())
        .then(data => {
            const angelsTableBody = document.getElementById('angelsTableBody');
            data.forEach(angel => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${angel.id}</td>
                    <td>${angel.nombre}</td>
                    <td>${angel.codigo}</td>
                    <td>${angel.jerarquia}</td>
                    <td>${angel.captura}</td>
                    <td>${angel.estado}</td>
                    <td>${angel.fecha_registro}</td>
                `;
                angelsTableBody.appendChild(row);
            });
        })
        .catch(error => console.error('Error al obtener ángeles:', error));

    // Obtener y mostrar los experimentos
    fetch('/obtenerExperimentos')
        .then(response => response.json())
        .then(data => {
            const experimentsTableBody = document.getElementById('experimentsTableBody');
            data.forEach(experiment => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${experiment.numero_experimento}</td>
                    <td>${experiment.tipo_experimento}</td>
                    <td>${experiment.descripcion}</td>
                    <td>${experiment.resultado}</td>
                `;
                experimentsTableBody.appendChild(row);
            });
        })
        .catch(error => console.error('Error al obtener experimentos:', error));
});
