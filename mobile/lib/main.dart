import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_overlay_window/flutter_overlay_window.dart';
import 'package:flutter_tts/flutter_tts.dart';
import 'package:google_mlkit_text_recognition/google_mlkit_text_recognition.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'overlay_entry.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const ReadGlassApp());
}

class ReadGlassApp extends StatelessWidget {
  const ReadGlassApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'ReadGlass',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF5EC4B2),
          brightness: Brightness.dark,
        ),
        useMaterial3: true,
      ),
      home: const HomeScreen(),
    );
  }
}

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  static const _channel = MethodChannel('com.olamide.readglass/capture');
  static const _prefOverlay = 'overlay_on';

  final FlutterTts _tts = FlutterTts();
  StreamSubscription? _overlaySub;

  bool _overlayOn = false;
  bool _busy = false;
  String _status = 'Turn on the floating bubble, open your book in Chrome, then tap Listen.';

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    await _tts.setSpeechRate(0.48);
    await _tts.setVolume(1.0);
    await _tts.setLanguage('en-US');
    final prefs = await SharedPreferences.getInstance();
    final on = prefs.getBool(_prefOverlay) ?? false;
    final active = await FlutterOverlayWindow.isActive();
    setState(() => _overlayOn = on || active);
    _listenOverlay();
    if (_overlayOn && !active) {
      await _showOverlay();
    }
  }

  void _listenOverlay() {
    _overlaySub?.cancel();
    _overlaySub = FlutterOverlayWindow.overlayListener.listen((event) async {
      if (event is! Map) return;
      final action = event['action'];
      if (action == 'listen') {
        await _captureAndSpeak();
      } else if (action == 'stop') {
        await _tts.stop();
        setState(() => _status = 'Stopped.');
        await FlutterOverlayWindow.shareData({'status': 'Idle — tap Listen'});
      }
    });
  }

  Future<void> _ensureOverlayPermission() async {
    final granted = await FlutterOverlayWindow.isPermissionGranted();
    if (!granted) {
      await FlutterOverlayWindow.requestPermission();
    }
  }

  Future<void> _showOverlay() async {
    await _ensureOverlayPermission();
    final granted = await FlutterOverlayWindow.isPermissionGranted();
    if (!granted) {
      setState(() => _status = 'Overlay permission is required for the floating bubble.');
      return;
    }
    await Permission.notification.request();
    final active = await FlutterOverlayWindow.isActive();
    if (!active) {
      await FlutterOverlayWindow.showOverlay(
        enableDrag: true,
        overlayTitle: 'ReadGlass',
        overlayContent: 'Listen',
        flag: OverlayFlag.defaultFlag,
        visibility: NotificationVisibility.visibilityPublic,
        positionGravity: PositionGravity.auto,
        height: 120,
        width: 160,
      );
    }
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_prefOverlay, true);
    setState(() {
      _overlayOn = true;
      _status = 'Bubble is on. Open Selar in Chrome, then tap Listen on the bubble.';
    });
  }

  Future<void> _hideOverlay() async {
    try {
      await FlutterOverlayWindow.closeOverlay();
    } catch (_) {}
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_prefOverlay, false);
    setState(() {
      _overlayOn = false;
      _status = 'Floating bubble off.';
    });
  }

  Future<void> _setOverlay(bool on) async {
    if (on) {
      await _showOverlay();
    } else {
      await _hideOverlay();
    }
  }

  Future<void> _captureAndSpeak() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _status = 'Capturing screen…';
    });
    await FlutterOverlayWindow.shareData({'status': 'Capturing…'});

    try {
      // Briefly hide bubble so OCR doesn't read the controls.
      final wasActive = await FlutterOverlayWindow.isActive();
      if (wasActive) {
        try {
          await FlutterOverlayWindow.closeOverlay();
        } catch (_) {}
        await Future<void>.delayed(const Duration(milliseconds: 350));
      }

      final path = await _channel.invokeMethod<String>('captureScreen');
      if (wasActive) {
        await _showOverlay();
      }

      if (path == null || path.isEmpty) {
        setState(() => _status = 'Screen capture cancelled or failed.');
        await FlutterOverlayWindow.shareData({'status': 'Capture failed'});
        return;
      }

      setState(() => _status = 'Reading text…');
      await FlutterOverlayWindow.shareData({'status': 'Reading text…'});

      final recognizer = TextRecognizer(script: TextRecognitionScript.latin);
      final recognized = await recognizer.processImage(InputImage.fromFilePath(path));
      await recognizer.close();

      final text = recognized.text.trim();
      try {
        await File(path).delete();
      } catch (_) {}

      if (text.isEmpty) {
        setState(() => _status = 'No text found. Open a book page, then tap Listen again.');
        await FlutterOverlayWindow.shareData({'status': 'No text found'});
        return;
      }

      final preview = text.length > 80 ? '${text.substring(0, 80)}…' : text;
      setState(() => _status = 'Listening: $preview');
      await FlutterOverlayWindow.shareData({'status': 'Listening…'});
      await _tts.stop();
      await _tts.speak(text);
      await FlutterOverlayWindow.shareData({'status': 'Done — flip page, tap Listen'});
      setState(() => _status = 'Done. Flip to the next page, then tap Listen on the bubble.');
    } on PlatformException catch (e) {
      setState(() => _status = e.message ?? 'Capture failed.');
      await FlutterOverlayWindow.shareData({'status': 'Capture failed'});
      // Restore overlay if we hid it.
      if (!(await FlutterOverlayWindow.isActive()) && _overlayOn) {
        await _showOverlay();
      }
    } catch (e) {
      setState(() => _status = 'Error: $e');
      await FlutterOverlayWindow.shareData({'status': 'Error'});
      if (!(await FlutterOverlayWindow.isActive()) && _overlayOn) {
        await _showOverlay();
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void dispose() {
    _overlaySub?.cancel();
    _tts.stop();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
          children: [
            const Text(
              'ReadGlass',
              style: TextStyle(fontSize: 34, fontWeight: FontWeight.w700, letterSpacing: -1),
            ),
            const SizedBox(height: 8),
            Text(
              'Floating bubble like Tracker Voice — stays on top of Chrome while you read Selar.',
              style: TextStyle(color: Colors.white.withValues(alpha: 0.7), height: 1.4),
            ),
            const SizedBox(height: 24),
            Card(
              child: SwitchListTile(
                title: const Text('Floating bubble'),
                subtitle: const Text('Show ReadGlass over other apps'),
                value: _overlayOn,
                onChanged: _busy ? null : _setOverlay,
              ),
            ),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: _busy ? null : _captureAndSpeak,
              icon: const Icon(Icons.record_voice_over),
              label: Text(_busy ? 'Working…' : 'Listen to this screen'),
            ),
            const SizedBox(height: 16),
            Text(_status, style: TextStyle(color: Colors.white.withValues(alpha: 0.75), height: 1.45)),
            const SizedBox(height: 28),
            const Text('How to use', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
            const SizedBox(height: 10),
            const Text(
              '1. Turn on Floating bubble and allow “Display over other apps”.\n'
              '2. Open your book in Chrome (selar.com), not the Selar app.\n'
              '3. Tap Listen on the green bubble.\n'
              '4. Allow screen capture when Android asks (first time).\n'
              '5. Flip the page, tap Listen again.',
              style: TextStyle(height: 1.5),
            ),
          ],
        ),
      ),
    );
  }
}
