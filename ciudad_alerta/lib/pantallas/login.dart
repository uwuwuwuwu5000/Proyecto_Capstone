import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../auth.dart';
import '../main.dart';
import 'recuperar_password.dart';
import 'registro.dart';

/// CA-49 : inicio de sesión.
class LoginPantalla extends StatefulWidget {
  const LoginPantalla({super.key});

  @override
  State<LoginPantalla> createState() => _LoginPantallaState();
}

class _LoginPantallaState extends State<LoginPantalla> {
  final _correo = TextEditingController();
  final _password = TextEditingController();
  bool _cargando = false;

  @override
  void dispose() {
    _correo.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _entrar() async {
    if (_correo.text.trim().isEmpty || _password.text.isEmpty) {
      _aviso('Completa tu correo y tu contraseña.');
      return;
    }

    setState(() => _cargando = true);
    try {
      await Auth.iniciarSesion(
        correo: _correo.text,
        password: _password.text,
      );
      // No navegamos: ControlAcceso detecta la sesión y muestra Inicio.
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
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Image.asset(
                  'assets/logo.png',
                  height: 120,
                ),
              ),
              const SizedBox(height: 12),
              const Text(
                'Plataforma de Inteligencia Urbana Comunitaria',
                textAlign: TextAlign.center,
                style: TextStyle(color: kGris, fontSize: 13),
              ),
              const SizedBox(height: 20),
              const Text(
                'Inicia sesión',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 26,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF111111),
                ),
              ),
              const SizedBox(height: 24),

              const Etiqueta('Correo electrónico'),
              TextField(
                controller: _correo,
                keyboardType: TextInputType.emailAddress,
                autocorrect: false,
                decoration: const InputDecoration(
                  hintText: 'nombre@correo.cl',
                ),
              ),
              const SizedBox(height: 16),

              const Etiqueta('Contraseña'),
              TextField(
                controller: _password,
                obscureText: true,
                decoration: const InputDecoration(hintText: '••••••'),
              ),
              const SizedBox(height: 24),

              ElevatedButton(
                onPressed: _cargando ? null : _entrar,
                child: _cargando
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Text('Iniciar sesión'),
              ),
              const SizedBox(height: 12),

              FilledButton(
                onPressed: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const RecuperarPasswordPantalla(),
                  ),
                ),
                child: const Text('¿Olvidaste tu contraseña?'),
              ),
              const SizedBox(height: 24),

              TextButton(
                onPressed: () => Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const RegistroPantalla()),
                ),
                child: const Text(
                  '¿No tienes cuenta? Regístrate',
                  style: TextStyle(color: kMoradoTexto),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
