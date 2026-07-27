import 'package:flutter_test/flutter_test.dart';
import 'package:readglass_mobile/main.dart';

void main() {
  testWidgets('ReadGlass home loads', (WidgetTester tester) async {
    await tester.pumpWidget(const ReadGlassApp());
    expect(find.text('ReadGlass'), findsWidgets);
  });
}
