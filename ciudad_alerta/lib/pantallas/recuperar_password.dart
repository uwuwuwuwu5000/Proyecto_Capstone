import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../auth.dart';
import '../main.dart';

/// CA-75 : recuperación de contraseña.
class RecuperarPasswordPantalla extends StatefulWidget {
  const RecuperarPasswordPantalla({super.key});

  @override
  State<RecuperarPasswordPantalla> createState() =>
      _RecuperarPasswordPantallaState();
}

class _RecuperarPasswordPantallaState extends State<RecuperarPasswordPantalla> {
  final _correo = TextEditingController();
  bool _cargando = false;
  bool _enviado = false;

  @override
  void dispose() {
    _correo.dispose();
    super.dispose();
  }

  Future<void> _enviar() async {
    if (_correo.text.trim().isEmpty) {
      _aviso('Escribe tu correo electrónico.');
      return;
    }

    setState(() => _cargando = true);
    try {
      await Auth.recuperarPassword(_correo.text);
      if (mounted) setState(() => _enviado = true);
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
      appBar: AppBar(title: const Text('Recuperar contraseña')),
      body: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
        child: _enviado ? _mensajeEnviado() : _formulario(),
      ),
    );
  }

  Widget _formulario() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text(
          'Te enviaremos un enlace a tu correo para que puedas crear una '
          'contraseña nueva.',
          style: TextStyle(color: kGris, fontSize: 13),
        ),
        const SizedBox(height: 24),
        const Etiqueta('Correo electrónico'),
        TextField(
          controller: _correo,
          keyboardType: TextInputType.emailAddress,
          autocorrect: false,
          decoration: const InputDecoration(hintText: 'nombre@correo.cl'),
        ),
        const SizedBox(height: 24),
        ElevatedButton(
          onPressed: _cargando ? null : _enviar,
          child: _cargando
              ? const SizedBox(
                  height: 20,
                  width: 20,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                )
              : const Text('Enviar enlace'),
        ),
      ],
    );
  }

  Widget _mensajeEnviado() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Icon(Icons.mark_email_read_outlined, size: 64, color: kMorado),
        const SizedBox(height: 16),
        const Text(
          'Revisa tu correo',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 8),
        Text(
          'Si existe una cuenta asociada a ${_correo.text.trim()}, recibirás '
          'un enlace para restablecer tu contraseña.',
          textAlign: TextAlign.center,
          style: const TextStyle(color: kGris, fontSize: 13),
        ),
        const SizedBox(height: 24),
        FilledButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Volver a iniciar sesión'),
        ),
      ],
    );
  }
}
