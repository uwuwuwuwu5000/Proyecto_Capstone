import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../auth.dart';
import '../main.dart';

/// CA-48 : registro de usuario.
class RegistroPantalla extends StatefulWidget {
  const RegistroPantalla({super.key});

  @override
  State<RegistroPantalla> createState() => _RegistroPantallaState();
}

class _RegistroPantallaState extends State<RegistroPantalla> {
  final _nombre = TextEditingController();
  final _correo = TextEditingController();
  final _password = TextEditingController();
  final _repetir = TextEditingController();
  bool _cargando = false;

  @override
  void dispose() {
    _nombre.dispose();
    _correo.dispose();
    _password.dispose();
    _repetir.dispose();
    super.dispose();
  }

  Future<void> _crearCuenta() async {
    if (_nombre.text.trim().isEmpty ||
        _correo.text.trim().isEmpty ||
        _password.text.isEmpty) {
      _aviso('Completa todos los campos.');
      return;
    }
    if (_password.text.length < 6) {
      _aviso('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (_password.text != _repetir.text) {
      _aviso('Las contraseñas no coinciden.');
      return;
    }

    setState(() => _cargando = true);
    try {
      await Auth.registrar(
        nombre: _nombre.text,
        correo: _correo.text,
        password: _password.text,
      );
      // Firebase deja la sesión iniciada, así que ControlAcceso
      // muestra Inicio automáticamente.
    } on FirebaseAuthException catch (e) {
      _aviso(Auth.mensajeError(e));
    } finally {
      if (mounted) setState(() => _cargando = false);
    }
  }

  void _aviso(String texto) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(texto)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Crear cuenta')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Crea tu cuenta para reportar y confirmar incidencias urbanas.',
              style: TextStyle(color: kGris, fontSize: 13),
            ),
            const SizedBox(height: 24),

            const Etiqueta('Nombre'),
            TextField(
              controller: _nombre,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(hintText: 'Martín Pérez'),
            ),
            const SizedBox(height: 16),

            const Etiqueta('Correo electrónico'),
            TextField(
              controller: _correo,
              keyboardType: TextInputType.emailAddress,
              autocorrect: false,
              decoration: const InputDecoration(hintText: 'nombre@correo.cl'),
            ),
            const SizedBox(height: 16),

            const Etiqueta('Contraseña'),
            TextField(
              controller: _password,
              obscureText: true,
              decoration: const InputDecoration(hintText: 'Mínimo 6 caracteres'),
            ),
            const SizedBox(height: 16),

            const Etiqueta('Repetir contraseña'),
            TextField(
              controller: _repetir,
              obscureText: true,
              decoration: const InputDecoration(hintText: '••••••'),
            ),
            const SizedBox(height: 24),

            ElevatedButton(
              onPressed: _cargando ? null : _crearCuenta,
              child: _cargando
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Text('Crear cuenta'),
            ),
            const SizedBox(height: 12),

            FilledButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Ya tengo cuenta'),
            ),
          ],
        ),
      ),
    );
  }
}
