# のむペイ

[![IMAGE ALT TEXT HERE](https://jphacks.com/wp-content/uploads/2026/07/IMG_5316.png)](https://www.youtube.com/watch?v=piaNsc6ilBI)

## 製品概要
薬を飲み忘れてしまう課題に対して、薬箱やピルケースに貼ったQRコードを読み取ることで服用を記録できるアプリです。設定した時間になると通知し、一定時間内にQRコードが読み取られなかった場合は、あらかじめ設定した金額をペナルティとして課金されます。QRコードを読み取る動作を取り入れることで、飲み忘れ防止をサポートします。

### 背景(製品開発のきっかけ、課題等）
実際に薬を飲み忘れてしまい、とてもつらい思いをしたことがきっかけです。これまで飲み忘れ防止アプリも使ったことがありますが、通知が来ても「あとで飲もう」と後回しにしてしまい、結局忘れてしまうことがありました。そこで、ただ通知するだけではなく、飲まなかった場合にペナルティが発生するなど、少し強制力のある仕組みがあれば行動につながるのではないかと考えました。


### 製品説明（具体的な製品の説明）
「のむペイ」は、薬の飲み忘れを防ぎ、毎日の服薬を習慣化するための服薬管理アプリです。
ユーザーは、服薬する時間と、飲み忘れた場合のペナルティ金額をあらかじめ設定します。設定した時間になるとアプリから通知が届き、薬を飲んだ後に薬ケースなどに設置した専用QRコードを読み取ることで、その日の服薬を記録します。
指定した時間内にQRコードが読み取られなかった場合は、飲み忘れとして判定され、設定した金額のペナルティが記録されます。これにより、通常のリマインダーだけでは後回しにしてしまう人に対して、「飲まないと損をする」という仕組みから服薬を促します。
また、服薬履歴をカレンダー形式で確認できるほか、連続服薬日数が記録される機能を搭載します。
通知・QRコードによる服薬確認・ペナルティを組み合わせることで、毎日の「薬を飲む」という行動を習慣化することが、本アプリケーションの特徴です。

### 特長
#### 1. 特長1　QRコード読み込みで服薬を促す(ボタン操作だけでは完了せず、QRコードの読み込みが必要。)
#### 2. 特長2　ペナルティで後回しを防ぐ(飲み忘れにペナルティを設け、服薬を促進。)
#### 3. 特長3　先延ばししやすい人にも危機感を与える(期限とペナルティにより、「今飲む」意識を高める。)

### 解決出来ること
### 今後の展望
### 注力したこと（こだわり等）
* 
* 

## 開発技術
### 活用した技術
#### API・データ
* 
* 

#### フレームワーク・ライブラリ・モジュール
* 
* 

#### デバイス
* 
* 

### 独自技術
#### ハッカソンで開発した独自機能・技術
* 独自で開発したものの内容をこちらに記載してください
* 特に力を入れた部分をファイルリンク、またはcommit_idを記載してください。


# のむペイ Development Build開発環境

チームの標準は、**Expo Development Build（expo-dev-client）**です。各自のAndroid / iPhoneへ開発用アプリをインストールして使います。アプリの画面・ロジックは従来のままです。Expo Go用のQRではなく、このアプリ専用のDevelopment Buildを開いてください。

## 採用構成と生成ファイル

- Expo SDK 57 / React Native 0.86.3 / TypeScript strict / Expo Router
- Node.js **24.3.0以上の24系** / npm / package-lock.json（`.nvmrc`は24を指定）
- iOS・Androidの両方を有効化。`expo-dev-client`はSDK対応版を`expo install`で導入
- `app.json`が共有設定、`app.config.ts`はiOS Bundle Identifierのローカル上書きだけを担当
- 共通のアプリID：iOS / Androidとも`jp.jphacks.ok2605`。Personal Teamで競合する場合の対応は後述
- `ios/`・`android/`はExpo Prebuild（CNG）で生成し、既存方針に従って**Gitへ追加しない**
- ネイティブ設定はapp configとconfig pluginsで管理。生成されたソースを直接変更しない
- 個人のApple Account、Team ID、証明書、プロビジョニングプロファイルを共有設定へ固定しない

## 初回セットアップ

作業場所はこのREADMEがあるリポジトリのルート（現在は`doc/App/ok_2605/`）です。次の手順はPCの既定Node.jsが20系でも使えます。

```sh
cd /Users/ryusei/JPHACKS/doc/App/ok_2605
npm run setup
```

`setup`はNode.js 24をnpm経由で取得し、その環境で`npm ci`を実行します。初回はネット接続が必要です。取得済みのNode.jsは専用キャッシュを優先して再利用します。`.npmrc`でキャッシュをGit除外済みの`.npm-cache/`へ向け、`~/.npm`の権限エラーを避けます。システムのNode.jsやホーム側キャッシュの権限を変更する必要はありません。

`.nvmrc`を書くだけでは、現在のターミナルのNode.jsは切り替わりません。nvmを使うメンバーは`nvm install` → `nvm use`でも24系に合わせられます。Node.js 24環境なら通常の`npm ci`・`npm start`・`npm run android`・`npm run ios`も使えます。

| 操作 | PCの既定Node.jsに依存しないコマンド |
| --- | --- |
| 初回・依存関係の同期 | `npm run setup` |
| 開発サーバー | `npm run start:node24` |
| Android実機ビルド | `npm run android:node24` |
| iOS実機ビルド | `npm run ios:node24` |
| 任意のコマンド（例：iOS再生成） | `npm run node24 -- npm run prebuild:ios` |

Android / iOSのネイティブツール・署名の準備は、以下のOS別手順で行ってください。Node.js 24の取得だけではXcode・Android SDKはインストールされません。

## Android：USB接続でビルド・インストール

1. Android Studio、JDK 17、Android SDK / Build-Tools / Platform-Toolsを導入する。現在のReact Native 0.86.3が要求するAndroid SDK Platform 36・Build-Tools 36.0.0・NDK 27.1.12297006・CMake（現行の実機ビルドで使用する3.22.1）もSDK Managerで追加する。
2. Android StudioのSDK Locationと`ANDROID_HOME`を合わせ、`$ANDROID_HOME/platform-tools`をPATHへ追加する。macOSの一般的な例：

   ```sh
   export ANDROID_HOME="$HOME/Library/Android/sdk"
   export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator"
   ```

SDK LocationはAndroid StudioのSDK Managerで確認してください。`SDK location not found`が表示された場合は、ビルドする**同じターミナル**で上記の`ANDROID_HOME`と`PATH`を設定し直してから再実行します。PCごとの`android/local.properties`の`sdk.dir`でも指定できますが、これはGit除外されるローカル環境設定であり、Prebuildの`--clean`で削除されます。共有ファイルには個人のSDK絶対パスを書きません。

3. Android端末の開発者向けオプションとUSBデバッグを有効にし、USB接続時の許可ダイアログを承認する。
4. 接続を確認してビルドする。

   ```sh
   adb devices
   npm run android
   ```

`android`は`expo run:android --device`です。初回はAndroidプロジェクトを生成し、Debugビルドを作成・インストールしてMetroを起動します。既に別ターミナルでMetroを起動している場合は`npm run android -- --no-bundler`を使えます。`unauthorized`は端末側のUSBデバッグ許可を確認してください。

以降は`npm start`で起動した開発サーバーへ、端末内の開発用アプリから接続します。同じLANに参加できない場合はUSB接続したまま、別ターミナルで`adb reverse tcp:8081 tcp:8081`を実行し、`npm start -- --localhost`を使えます。8081以外を選んだ場合はreverseするポートも合わせてください。

## iOS：無料Apple Account（Personal Team）で実機ビルド

クラウドのEAS Build / TestFlightを前提にせず、**各メンバーのMacとXcodeでローカル署名・ビルド**します。この経路で通常の実機テストを行うための有料Apple Developer Program登録は不要です。

1. 対応するXcode本体と必要なiOSサポートを導入する。Command Line Toolsだけではビルドできません。Xcodeを開いて初期設定を完了し、SettingsのCommand Line ToolsでそのXcodeを選びます。CocoaPodsも導入して`pod --version`を確認します（Expo Doctorの推奨は1.15.2以上）。Homebrewを利用している場合は`brew install cocoapods`で導入できます。
2. XcodeのSettings → Accountsで自分のApple Accountを追加し、Personal Teamを使える状態にする。
3. iPhoneをUSB接続してMacを信頼し、端末で求められるDeveloper Modeを有効にする。
4. 生成プロジェクトとPodsを準備する。

   ```sh
   npm run prebuild:ios
   open ios/*.xcworkspace
   ```

5. Xcodeでアプリのターゲット → Signing & Capabilitiesを開き、Automatically manage signingを有効化して**自分のPersonal Team**を選ぶ。実行先を接続したiPhoneにしてRunする。端末で開発者の信頼を求められた場合は設定アプリから承認する。
6. 以降のビルド・インストールは次でも実行できる。

   ```sh
   npm run ios
   ```

`ios`は`expo run:ios --device`です。署名済みの開発証明書をCLIが認識できる場合は、初回からこのコマンドで生成・インストールできます。認識できない場合は先に上のXcodeでの署名設定を行ってください。Metroだけを起動する場合は別ターミナルで`npm start`を実行します。

### Bundle Identifierが使用済みと表示される場合

Personal Teamごとの登録で共通IDが利用できない場合は、`.env.example`を`.env.local`へコピーし、**自分用の一意なID**を指定してください。

```sh
cp .env.example .env.local
```

`.env.local`の例（`example`部分は自分用に置き換える）：

```dotenv
IOS_BUNDLE_IDENTIFIER=jp.example.nomupay.dev
```

その後`npm run prebuild:ios`で再生成し、XcodeでPersonal Teamを再選択します。`.env.local`はGit除外済みです。これはアプリIDの指定であり、Apple Account・パスワード・Team IDは書きません。

### Personal TeamとNFCの制限

- Personal Teamのプロビジョニングは7日で期限が切れるため、継続利用には再ビルド・再インストールが必要です。登録できるApp ID・端末・インストール数にも制限があります。
- Personal Teamのビルドを他のメンバーへ配布して共通利用する運用にはしません。各自が自分の端末向けに署名します。
- Appleの対応表では**NFC Tag Readingは無料のPersonal Teamでは利用できません**。将来iOSでNFCを実機検証する際は対応する有料のチーム署名等を別途検討してください。
- AndroidにはPersonal Teamに相当する制約はありません。NFC対応Android実機では、Development Buildから薬箱のNFCタグを読み取れます。
- `react-native-nfc-manager`とAndroid NFC権限を追加しています。Expo GoとAndroidエミュレーターではNFCを利用できないため、NFC画面のデモボタンで完了動作を確認します。

[Apple公式：Personal Teamの実機テストと期限](https://developer.apple.com/help/account/basics/about-your-developer-account)

[Apple公式：iOSの対応Capability](https://developer.apple.com/help/account/reference/supported-capabilities-ios)

## 毎日の起動・Fast Refresh

各OSのDevelopment Buildを一度端末にインストールした後：

```sh
npm start
```

標準コマンドは`expo start --dev-client`です。同じLANに接続した端末の開発用アプリでサーバーを選択するか、表示されたQRを読み取ります。LAN上のローカル開発ではExpo Goの同一アカウント認証は使いません。接続できないときはLAN・ファイアウォール・ローカルネットワーク権限を確認してください。

AndroidでNFCを確認する場合は、NFC対応実機にDevelopment Buildを再インストールします。

```sh
npm run android
npm start
```

Expo GoまたはAndroidエミュレーターで画面だけを確認する場合は`npx expo start --go`を実行します。Expo GoではネイティブNFC読み取りはできません。

TypeScript / JavaScriptや画面のスタイルを保存すると、Fast Refreshで反映されます。状態が残るため画面上の動作も確認し、必要なら開発メニューからReloadしてください。Metroだけなら`npm start -- --clear`でキャッシュを更新できます。

`npm run web`は既存の補助コマンドとして維持しますが、カメラ・端末DBを含む今回の受け入れ確認はAndroid / iOS実機で行います。

## Gitで変更を取得したメンバーが行うこと

まず自分の未コミット変更を保護してから、チームの運用に従って変更を取得してください。この移行を初めて取得した場合は、全員が`npm ci`を実行し、自分のOSのDevelopment Buildをビルド・インストールします。

| 取得した変更 | 必要な作業 |
| --- | --- |
| 初回・今回の移行 | `npm ci` → OS別の初回ビルド → `npm start` |
| TS / JS・画面のスタイルのみ | 起動中ならFast Refresh、停止中なら`npm start` |
| package.json / package-lock.json | `npm ci`。ネイティブ依存が変わった場合は再生成・再ビルド |
| app.json / app.config.ts / config plugins・権限・アプリID・ネイティブ素材・SDKの変更 | 依存関係を同期して、対象OSのPrebuild・再ビルド |

## ネイティブ変更時の再生成・再ビルド

ネイティブライブラリの追加やSDK更新、plugin・権限・アプリID・ネイティブ設定の変更を行ったときは、対象OSの開発用アプリを作り直します。Metroの再起動だけでは反映されません。

```sh
# 新しいライブラリはExpo互換バージョンで追加
npx expo install <package>

# Android
npm run prebuild:android
npm run android

# iOS
npm run prebuild:ios
# cleanでローカル署名設定も再生成されるため、必要ならXcodeでTeamを再選択
npm run ios
```

`prebuild:android` / `prebuild:ios`は対象OSの`--clean`を実行し、その生成フォルダを削除・再作成します。両方のOSへ変更を反映するメンバーは両方で実行します。生成フォルダのソースへ行った直接編集は消えるので、必要な変更はapp config / config pluginとして管理してください。

## 既存データと実機での確認

画面・画面遷移・服用状態・薬登録・SQLite・デモ決済処理など、`src/`と`tests/`の内容は今回変更しません。既存ライブラリは維持します。

Development BuildはExpo Goとは別アプリで、データ保存領域も別です。Expo Go内のSQLiteデータは新しい開発用アプリへ自動移行されません。また、アプリの削除やBundle Identifier / applicationId変更は保存データへ影響するため、必要な記録を残してから行ってください。同じIDのアプリを上書きビルドする通常の開発と区別します。

実機ではホーム・既存の画面遷移・薬登録と再起動後の保存・QR許可と読み取り・ペナルティとデモ決済を確認してください。ブラウザでの表示やバンドル成功だけでは、これらの実機動作を確認したことにはしません。

## 確認コマンド

```sh
npm run typecheck
npm run lint
npm test
npm run check:dependencies
npm run export:ios
npm run export:android
npx expo config --type introspect
```

`expo export`はJS・アセットのバンドル確認です。Xcode / Gradleによるネイティブビルド・署名・実機インストールとは別です。

## 公式資料

- [Expo SDK 57 DevClient](https://docs.expo.dev/versions/v57.0.0/sdk/dev-client/)
- [Expo：ローカル開発ビルド](https://docs.expo.dev/guides/local-app-development/)
- [Expo：Development Buildの使い方と再ビルド](https://docs.expo.dev/develop/development-builds/use-development-builds/)
- [Expo：Continuous Native Generation](https://docs.expo.dev/workflow/continuous-native-generation/)
