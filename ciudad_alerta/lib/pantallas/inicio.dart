import 'package:flutter/material.dart';

import '../auth.dart';
import '../main.dart';

/// Menú principal (mockup "Ciudad Alerta").
/// Solo la autenticación está implementada en el Sprint 1; el resto de los
/// accesos queda visible pero avisa que llega en los próximos sprints.
class InicioPantalla extends StatelessWidget {
  const InicioPantalla({super.key});

  @override
  Widget build(BuildContext context) {
    // Primer nombre del usuario, para el saludo del banner.
    final nombre = (Auth.usuario?.displayName ?? '').split(' ').first;

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: const Text('Ciudad Alerta'),
        actions: [
          IconButton(
            icon: const Icon(Icons.notifications_none),
            color: kMorado,
            onPressed: () => _proximamente(context),
          ),
        ],
      ),
      drawer: _MenuLateral(nombre: Auth.usuario?.displayName ?? 'Usuario'),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: 0,
        type: BottomNavigationBarType.fixed,
        selectedItemColor: kRojo,
        unselectedItemColor: kGris,
        selectedFontSize: 11,
        unselectedFontSize: 11,
        onTap: (i) {
          if (i != 0) _proximamente(context);
        },
        items: const [
          BottomNavigationBarItem(
            icon: Icon(Icons.home_outlined),
            label: 'Inicio',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.place_outlined),
            label: 'Mapa',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.add_circle_outline),
            label: 'Reportar',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.list_alt_outlined),
            label: 'Reportes',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.person_outline),
            label: 'Perfil',
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Banner morado de bienvenida
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: kMorado,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '¡Hola, ${nombre.isEmpty ? 'vecino' : nombre}!',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Gracias por contribuir a una comuna más segura.',
                  style: TextStyle(color: Colors.white70, fontSize: 13),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Cuadrícula de accesos
          Row(
            children: [
              Expanded(
                child: _Tarjeta(
                  icono: Icons.warning_amber_rounded,
                  titulo: 'Reportar\nincidencia',
                  onTap: () => _proximamente(context),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _Tarjeta(
                  icono: Icons.place,
                  titulo: 'Mapa',
                  onTap: () => _proximamente(context),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _Tarjeta(
                  icono: Icons.assignment_outlined,
                  titulo: 'Mis reportes',
                  onTap: () => _proximamente(context),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _Tarjeta(
                  icono: Icons.notifications_active_outlined,
                  titulo: 'Alertas\npreventivas',
                  onTap: () => _proximamente(context),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Tarjeta ancha
          _Tarjeta(
            icono: Icons.emoji_events_outlined,
            titulo: 'Mi participación',
            subtitulo: 'Aportes, confirmaciones y reconocimientos',
            ancha: true,
            onTap: () => _proximamente(context),
          ),
        ],
      ),
    );
  }

  static void _proximamente(BuildContext context) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Disponible en un próximo sprint.')),
    );
  }
}

class _Tarjeta extends StatelessWidget {
  const _Tarjeta({
    required this.icono,
    required this.titulo,
    required this.onTap,
    this.subtitulo,
    this.ancha = false,
  });

  final IconData icono;
  final String titulo;
  final String? subtitulo;
  final bool ancha;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        height: ancha ? null : 110,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(color: kBorde),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icono, color: kMorado, size: 28),
            const SizedBox(height: 8),
            Text(
              titulo,
              style: const TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.bold,
                color: Color(0xFF111111),
              ),
            ),
            if (subtitulo != null) ...[
              const SizedBox(height: 2),
              Text(
                subtitulo!,
                style: const TextStyle(fontSize: 12, color: kGris),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Menú lateral (el ícono ☰ del mockup). Contiene el cierre de sesión.
class _MenuLateral extends StatelessWidget {
  const _MenuLateral({required this.nombre});

  final String nombre;

  @override
  Widget build(BuildContext context) {
    return Drawer(
      backgroundColor: Colors.white,
      child: SafeArea(
        child: Column(
          children: [
            Container(
              width: double.infinity,
              color: kLavanda,
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const CircleAvatar(
                    backgroundColor: kMorado,
                    child: Icon(Icons.person, color: Colors.white),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    nombre,
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 16,
                    ),
                  ),
                  Text(
                    Auth.usuario?.email ?? '',
                    style: const TextStyle(color: kGris, fontSize: 12),
                  ),
                ],
              ),
            ),
            const Spacer(),
            const Divider(height: 1),

            // CA-77 : cierre de sesión
            ListTile(
              leading: const Icon(Icons.logout, color: kRojo),
              title: const Text(
                'Cerrar sesión',
                style: TextStyle(color: kRojo, fontWeight: FontWeight.w600),
              ),
              onTap: () async {
                final confirmar = await showDialog<bool>(
                  context: context,
                  builder: (ctx) => AlertDialog(
                    title: const Text('Cerrar sesión'),
                    content: const Text('¿Quieres salir de tu cuenta?'),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.pop(ctx, false),
                        child: const Text('Cancelar'),
                      ),
                      TextButton(
                        onPressed: () => Navigator.pop(ctx, true),
                        child: const Text(
                          'Cerrar sesión',
                          style: TextStyle(color: kRojo),
                        ),
                      ),
                    ],
                  ),
                );
                if (confirmar == true) {
                  await Auth.cerrarSesion();
                  // ControlAcceso devuelve solo a la pantalla de login.
                }
              },
            ),
          ],
        ),
      ),
    );
  }
}
