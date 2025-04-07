document.addEventListener("DOMContentLoaded", () => {
    // Verificar si el usuario está autenticado
    fetch('/session')
        .then(response => response.json())
        .then(data => {
            if (!data.loggedIn && window.location.pathname !== '/login.html') {
                window.location.href = '/login.html';  // Redirigir a login.html si no está autenticado
            }
            if (data.loggedIn && window.location.pathname === '/login.html') {
                window.location.href = '/';  // Redirigir a index.html si ya está autenticado
            }

            // Mostrar u ocultar la sección de usuarios dependiendo del rol
            const usersSection = document.getElementById('usersSection');
            if (usersSection) {
                if (data.rol === 'admin') {
                    usersSection.style.display = 'block';  // Mostrar sección si es admin
                } else {
                    usersSection.style.display = 'none';  // Ocultar sección si no es admin
                }
            }
        })
        .catch(error => {
            console.error('Error al verificar la sesión:', error);
        });

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

        fetch('/obtenerUsuarios')
        .then(response => response.json())
        .then(data => {
        const usersTableBody = document.getElementById('usersTableBody');
        data.forEach(user => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${user.id}</td>
                <td>${user.username}</td>
                <td>${user.rol}</td>
                <td>
                <button class="btn btn-warning">Editar</button>
                <button class="btn btn-danger">Eliminar</button>
                </td>
            `;
            usersTableBody.appendChild(row);
          });
        })
        .catch(error => console.error('Error al obtener usuarios:', error));


});
