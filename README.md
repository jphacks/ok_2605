# のむペイ Expo開発環境

JPHACKS向けのReact Native + TypeScript + Expo（iOS）の開発用プロジェクトです。HTMLの画面検討は同じ`doc/demo/`内の`medication-ui`系を参照し、実装本体は将来`doc/App/ok_2605/`へ移します。

## 現在の画面

- `src/app/index.tsx`：くすり日和のホーム、服用予定、達成状況
- `src/app/qr.tsx`：カメラ許可、QR読み取り、読み取り結果の確認アラート
- `src/app/_layout.tsx`：Expo Routerのルートレイアウト

## 起動

```bash
cd doc/demo/expo-medication-app
npm ci
npm start
```

iOS Simulatorを起動する場合は`npm run ios`を使います。Xcode本体とSimulatorランタイムが必要です。QRカメラはiPhone実機で確認してください。SDK 57対応のExpo Go、または開発ビルドを使用します。Node.jsは24系（24.3.0以上）を使用します。

## 使用パッケージ

- Expo SDK 57
- TypeScript
- Expo Router
- `expo-camera`（QRコードは`barcodeTypes: ['qr']`に限定）
- 状態管理はReact `useReducer`とContext。QR画面からホームへ服用状態を共有します。

## ディレクトリ

```text
expo-medication-app/
├── src/app/          # Expo Routerの画面とレイアウト
├── src/components/   # テンプレートの共通UI部品
├── src/state/        # デモQR検証・服用状態・Context
├── src/types/        # CSSなどの型宣言
├── tests/            # QR検証・二重記録防止のテスト
├── assets/           # Expoのアイコン・スプラッシュ素材
├── app.json          # Expo Router・カメラ権限の設定
├── package.json
└── tsconfig.json
```

実機では、QRの中身が`nomupay:demo:morning`の場合だけ朝のお薬のデモ記録としてホームに反映します。QRを用意できない場合は「デモ：ボタンで読み取り完了」を押して同じ完了フローを確認できます。製品版QRの形式は未確定です。他のQRは拒否し、二重読み取りと二重記録を防ぎます。設定を拒否した場合もデモボタンは利用できます。

メモリ内の状態は再起動でリセットされます。服薬履歴、日付ごとのスケジュール、サーバー保存、決済、通知は未実装です。達成状況はサンプルです。既存テンプレートのWeb部品も残していますが、今回の対応対象はiOSです。

## 検証

- `npm run typecheck`：画面・共通部品・フック・状態を含めて合格。
- `npm run lint`：合格。
- `npm test`：対象外QRの拒否、正しいQRの記録、二重記録防止の2テスト合格。
- `npx expo install --check`：依存互換性確認に合格。
- `npm run export:ios`：JSとアセットの生成に成功。署名済みiOSアプリのビルドではありません。
- Simulator・実機カメラ・権限操作：未検証。現在のXcode選択先はCommand Line Toolsです。
- `npm audit`：27件（high 19、moderate 8）。Expo/Metro等の推移依存を含み、SDKのダウングレードを伴う自動修正は未適用。

pull・pushはユーザーが実施します。push版作成時は提出先を確認し、`node_modules`、`.expo`、`dist`、demo側の`.git`をコピー対象から除外します。
