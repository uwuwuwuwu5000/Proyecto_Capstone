import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';

import 'firebase_options.dart';
import 'pantallas/inicio.dart';
import 'pantallas/login.dart';

// ---------------------------------------------------------------------------
// CA-45 / CA-78 : arranque de la app con Firebase inicializado
// ---------------------------------------------------------------------------
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
  runApp(const CiudadAlertaApp());
}

// ---------------------------------------------------------------------------
// Paleta tomada de los mockups de la presentación
// ---------------------------------------------------------------------------
const Color kRojo = Color(0xFFD71920); // botón primario
const Color kMorado = Color(0xFF34215F); // banner y títulos
const Color kMoradoTexto = Color(0xFF513372); // texto de botón secundario
const Color kLavanda = Color(0xFFEEE6F7); // barra superior y botón secundario
const Color kGris = Color(0xFF6B7280); // texto secundario
const Color kBorde = Color(0xFFE5E7EB); // bordes de tarjetas y campos

class CiudadAlertaApp extends StatelessWidget {
  const CiudadAlertaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Ciudad Alerta',
      debugShowCheckedModeBanner: false,
      theme: _tema(),
      home: const ControlAcceso(),
    );
  }
}

ThemeData _tema() {
  return ThemeData(
    useMaterial3: true,
    scaffoldBackgroundColor: Colors.white,
    colorScheme: ColorScheme.fromSeed(
      seedColor: kMorado,
      primary: kRojo,
      surface: Colors.white,
    ),

    // Barra superior lavanda, texto oscuro, sin sombra (como en los mockups)
    appBarTheme: const AppBarTheme(
      backgroundColor: kLavanda,
      foregroundColor: Color(0xFF111111),
      elevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(
        color: Color(0xFF111111),
        fontSize: 20,
        fontWeight: FontWeight.bold,
      ),
    ),

    // Botón primario rojo
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: kRojo,
        foregroundColor: Colors.white,
        minimumSize: const Size.fromHeight(48),
        elevation: 0,
        textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(8),
        ),
      ),
    ),

    // Botón secundario lavanda
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: kLavanda,
        foregroundColor: kMoradoTexto,
        minimumSize: const Size.fromHeight(48),
        elevation: 0,
        textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(8),
        ),
      ),
    ),

    // Campos de texto: fondo blanco, borde gris claro
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      contentPadding:
          const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: kBorde),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: kBorde),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: kMorado, width: 1.5),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// CA-50 : control de acceso a la app.
// Escucha el estado de sesión de Firebase: si hay usuario muestra Inicio,
// si no, muestra Login. También cubre CA-77 (al cerrar sesión vuelve solo).
// ---------------------------------------------------------------------------
class ControlAcceso extends StatelessWidget {
  const ControlAcceso({super.key});

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<User?>(
      stream: FirebaseAuth.instance.authStateChanges(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator(color: kRojo)),
          );
        }
        if (snapshot.hasData) {
          return const InicioPantalla();
        }
        return const LoginPantalla();
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Etiqueta sobre los campos ("Correo electrónico", "Contraseña", ...)
// tal como aparece en los mockups.
// ---------------------------------------------------------------------------
class Etiqueta extends StatelessWidget {
  const Etiqueta(this.texto, {super.key});

  final String texto;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Text(
        texto,
        style: const TextStyle(
          color: kMorado,
          fontSize: 14,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
