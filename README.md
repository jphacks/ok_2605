# のむペイ

## 今回のデモUI

`UI.png`を参考に、淡いピンクの画面・丸いカード・うさぎのモチーフで統一しています。下部タブは「ホーム／履歴／お薬／薬箱／設定」です。

1. 「薬箱」→「薬箱を追加する」で名前を入力し、登録完了画面で内容を確認します。
2. 薬の登録・編集で「この薬を入れる薬箱」を選びます。既存のお薬も移動できます。
3. iOSでは「薬箱」に表示される端末共通QRを印刷するか別の端末に表示し、ホームで対象の薬を選んで読み取ります。お薬・薬箱を増やしてもQRは1つです。旧バージョンの薬ごとのQRは使用できません。
4. Androidでは各薬箱の詳細画面でNFCタグを登録し、その薬が入っている薬箱のタグで服用を確認します。服薬用QR表示・読み取り機能はなく、カメラモジュールもAndroidのAutolinkingから除外しています。

薬箱・保管先・端末QRはSQLiteに保存します。既存のNFC薬箱は「いつもの薬箱」として引き継ぎます。端末QRはアプリのデータ単位で維持され、データ削除・再インストールでは再作成されます。

アプリの表示名とAndroidのネイティブ構成も変わるため、既存Development Buildへの反映にはPrebuildと再ビルドが必要です（下記の開発環境手順を参照）。

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

チームの標準は、**Expo Development Build（expo-dev-client）**です。各自のAndroid / iPhoneへ開発用アプリをインストールして使います。服用確認はiOSでQR、Androidで薬箱のNFCタグを使います。Expo CLIが表示する起動用QRは両OSで使えます。Expo Goではなく、このアプリ専用のDevelopment Buildを開いてください。

## 採用構成と生成ファイル

- Expo SDK 57 / React Native 0.86.3 / TypeScript strict / Expo Router
- Node.js **24.3.0以上の24系** / npm / package-lock.json（`.nvmrc`は24を指定）
- iOS・Androidの両方を有効化。`expo-dev-client`はSDK対応版を`expo install`で導入
- `app.json`が共有設定、`app.config.ts`はiOS Bundle Identifierのローカル上書きだけを担当
- 共通のアプリID：iOS / Androidとも`jp.jphacks.ok2605`。Personal Teamで競合する場合の対応は後述
- `ios/`・`android/`はExpo Prebuild（CNG）で生成し、既存方針に従って**Gitへ追加しない**
- ネイティブ設定はapp configとconfig pluginsで管理。生成されたソースを直接変更しない
- 個人のApple Account、Team ID、証明書、プロビジョニングプロファイルを共有設定へ固定しない

## OS別の服用確認

| 項目 | iOS | Android |
| --- | --- | --- |
| 服用確認の入口 | ホームで薬を選んでQRを読み取り | 薬箱タグの登録・NFC読み取り |
| NFCネイティブライブラリ | Autolinkingから除外 | react-native-nfc-manager 4.0.0 |
| 通知 | 端末内のローカル通知 | 端末内のローカル通知 |
| iOSのNFC・APNs署名権限 | 付けない | 対象外 |

### Androidの薬箱タグ

1. 「薬箱」で薬箱を追加し、詳細画面でNFCタグを登録する。
2. 「お薬」で薬名・毎日の服用時刻・ペナルティ設定額・薬を入れる薬箱を選んで登録する。
3. タグを変更するときは「薬箱」で対象の薬箱を開き、「NFCタグを変更する」を押す。
4. 「服薬リマインダー」で通知を許可する。Androidの設定の「アラームとリマインダー」も必要に応じて許可する。
5. 服用時刻になるとホームに表示される「NFCタグを読み取る」を押す。「○○を飲みましたか？ NFCタグにタッチ！」画面で同じタグにスマホを近づけ、服用完了画面を確認する。

服薬通知をタップした場合は、対象の薬の服用確認画面へ直接進み、そのままNFCタグを読み取れる。薬の情報画面やホームでのボタン操作は不要。通知を受け取った日付の服薬予定を開くため、前日以前の通知をタップしても今日の薬を誤って記録しない。

- 複数の薬箱を作成し、薬ごとに保管先を選ぶ。薬箱ごとに異なるNFCタグを登録する。同じタグを別の薬箱には登録できない。薬箱の移動やタグの変更後も、過去の服用記録は残す。
- タグの固定UIDを登録するため、NDEFテキスト等の書き込みは不要。固定UIDのあるNFCタグ（NTAG系等）を用意する。読み取るたびIDが変わるカードやスマホを薬箱タグとして使わない。
- 読み取り時刻が、選択した薬の服用時刻以上・30分後の期限未満である予定だけを記録する。同時刻の別の薬は自動で服用済みにしない。
- 初回のタグ登録では服用を記録しない。未登録・異なるタグ、期限外の読み取りは拒否する。同じ薬・予定日・時刻の二重記録はDBで防ぐ。
- タグと薬の紐づけ、服用記録は端末内SQLiteに保存する。NFCの記録はQRと共通の服用履歴にも保存し、ホーム・履歴カレンダーへ反映する。再起動後も記録を確認できる。アプリの削除・データ消去で失われる。
- 現在は実決済しないデモ。同じ薬・日付のQR・NFC服用記録があれば、課金デモと失敗履歴の再試行をスキップする。未読時の自動課金や、アプリ終了中のサーバー判定は未実装。
- NFC非対応、NFCオフ、読み取り失敗を画面に表示する。中止・画面離脱・バックグラウンド移行時は読み取りを終了する。タグなしで服用済みにするボタンはAndroidには設けない。

### iOSのデモ用署名

`plugins/with-demo-platforms.js`で、生成iOSのNFC・APNs権限とremote-notificationバックグラウンド設定を除外する。ローカル通知とQRカメラは残す。このプラグインはSDK 57のmod実行順序に合わせ、`app.json`のpluginsの先頭に置く。

NFCライブラリ自体も`package.json`の`expo.autolinking.ios.exclude`で除外し、iOSのQR画面からはimportしない。これらはAppleの無料Personal Teamで使わないCapabilityへの対処であり、Xcode・CocoaPodsの導入やApple Accountでの署名設定は引き続き必要。

### カレンダーとの統合・保存データ

- 今日の服薬予定、次の予定、時刻到来時の読取ボタン、履歴タブ・月カレンダーを維持する。iOSは端末共通QRで選択した薬の確認結果を保存し、Androidは「服用確認→NFCタッチ→服用完了」の画面遷移で、選択した薬の保管先のNFCを確認する。
- DBの服用履歴はバージョン4へ移行し、記録元としてQR・デモ・NFCを保存する。バージョン3のQR履歴・ID、薬登録、課金履歴を保持する。従来のNFC保存テーブルがあれば、その記録もカレンダーへ取り込む。
- Androidのホームでは、30分の確認期限を過ぎた薬を表示しつつ、新しい対象時刻の予定を案内する。薬箱のタグを登録・変更する入口も残す。
- 変更を反映したらアプリを完全に再起動する。移行後のDBは古いバージョンのアプリでは開けないため、古いmain版へ戻してデータ消去で対処しない。
- 既存データを使った移行と実機でのQR/NFC→カレンダー反映は未検証。

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

1. SDK 57に対応するXcode 26.4以上と必要なiOSサポートを導入する。Command Line Toolsだけではビルドできません。Xcodeを開いて初期設定を完了し、SettingsのCommand Line ToolsでそのXcodeを選びます。CocoaPodsも導入して`pod --version`を確認します（Expo Doctorの推奨は1.15.2以上）。Homebrewを利用している場合は`brew install cocoapods`で導入できます。
2. XcodeのSettings → Accountsで自分のApple Accountを追加し、Personal Teamを使える状態にする。
3. iPhoneをUSB接続してMacを信頼し、端末で求められるDeveloper Modeを有効にする。
4. 生成プロジェクトとPodsを準備する。

   ```sh
   npm run node24 -- npm run prebuild:ios
   open ios/*.xcworkspace
   ```

5. Xcodeでアプリのターゲット → Signing & Capabilitiesを開き、Automatically manage signingを有効化して**自分のPersonal Team**を選ぶ。実行先を接続したiPhoneにしてRunする。端末で開発者の信頼を求められた場合は設定アプリから承認する。
6. 以降のビルド・インストールは次でも実行できる。

   ```sh
   npm run ios
   ```

`ios`は`expo run:ios --device`です。署名済みの開発証明書をCLIが認識できる場合は、初回からこのコマンドで生成・インストールできます。認識できない場合は先に上のXcodeでの署名設定を行ってください。Metroだけを起動する場合は別ターミナルで`npm start`を実行します。

Xcodeから直接Runする場合もNode.js 24が必要です。Node 24ラッパー経由でPrebuildすると、config pluginがGit除外済み`ios/.xcode.env.local`にそのNode実行パスを記録します（存在するローカル設定は上書きしません）。Nodeのキャッシュを削除した場合はNode 24の再取得とPrebuildが必要です。

PCなしで動かすiPhoneデモが必要な場合は、XcodeのEdit Scheme → Run → Build Configurationを**Release**にして、接続したiPhoneへRunします。JSをアプリ内に同梱します。署名は自分のPersonal Teamで行い、無料署名の7日期限はReleaseでも同じです。Debugは開発サーバーへの接続が必要です。

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
- AndroidはNFC対応端末で、今回追加したNFCライブラリと権限を含めて再ビルドします。
- iOSはNFCを含めずQRを維持します。APNs Push権限も付けず、ローカル通知を使います。個別のTeam IDは共有設定に固定しません。

[Apple公式：Personal Teamの実機テストと期限](https://developer.apple.com/help/account/basics/about-your-developer-account)

[Apple公式：iOSの対応Capability](https://developer.apple.com/help/account/reference/supported-capabilities-ios)

## 毎日の起動・Fast Refresh

各OSのDevelopment Buildを一度端末にインストールした後：

```sh
npm start
```

標準コマンドは`expo start --dev-client`です。同じLANに接続した端末の開発用アプリでサーバーを選択するか、表示されたQRを読み取ります。LAN上のローカル開発ではExpo Goの同一アカウント認証は使いません。接続できないときはLAN・ファイアウォール・ローカルネットワーク権限を確認してください。

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

NFC追加後は、Androidで複数薬のタグ登録、未登録タグ拒否、時刻前・猶予内・期限後、同じ時刻の複数薬、再読み取り、再起動後の保存、通知からの遷移を確認してください。iOSはNFCモジュールと署名権限の除外を生成設定で確認済みですが、Personal Teamでの実機署名・インストールは未検証です。

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

## 服薬・飲み忘れのフロー（2026-10追加）

既存のExpo SDK 57 / Expo Router構成を継続しています。

- iOSは「薬箱」タブで端末共通QRを表示できます。端末内で生成され、編集・再起動後も同じコードです。スクリーンショットを印刷するか別端末に表示して読み取ります。
- iOSは端末共通QR、Androidは選択した薬の保管先のNFCタグで服薬を確認します。薬ごとに設定した前後の猶予内で記録でき、完了画面には次の薬名・時刻を表示します。別端末のQR、旧薬別QR・デモQR、別の薬箱のNFCタグ、期限外の読み取りは拒否します。
- 起動時・フォアグラウンド復帰時・起動中の15秒ごとに、登録以降の未服用予定を確認します。アプリを閉じていた間の予定も対象です。登録時点より前の時刻の予定にはペナルティを記録しません。
- 未服用のまま薬ごとの後の猶予が終了すると、金額・薬名・予定日時・決済結果をSQLiteに保存し、「課金されました」画面に遷移します。複数件はまとめて表示します。「確認してホームへ」を押すと確認済み状態が永続化されます。
- **決済は端末内のテストシミュレーターです。決済事業者のサンドボックス接続や実際の請求は行いません。** 成功時も画面に「テスト決済・実際の請求なし」と明記します。本番決済にはバックエンド、事前同意、決済手段登録、決済事業者の連携・冪等キー・Webhook検証が別途必要です。
- 設定 → 「ペナルティ履歴」で自動判定分を確認できます。失敗分は未課金として保存され、明示的に再試行できます。開発用の決済シミュレーターは独立したデモ履歴を使用し、自動判定分を変更しません。
- 薬の編集では旧スケジュールを履歴として残します。削除はその薬の各服用時間の今後の予定・通知を止め、過去の服薬記録と金額を保持します。同じ服用時間の同じ予定日の服薬・ペナルティは各1回です。
- DB v7 → v8は既存データを保持し、前の猶予を0分として追加します。設定済みの後の猶予は保持します。ネイティブ依存・署名・権限の追加はありません。

### 登録・編集の共通項目と前後の猶予

薬一覧から薬を選ぶと、登録と同じフォームで以下を編集できます。同じ薬に登録した複数の服用時間をまとめて読み込みます。

- 薬名、各服用時間・服用量（時間の追加・削除を含む）
- 開始日、服用期間（期限なし／日数指定／終了日指定）、通知の有効・無効
- 単位、在庫、メモ、罰金額、保管先の薬箱
- 前の猶予：0〜60分、後の猶予：5〜60分（いずれも5分刻み、初期値は前0分・後30分）

同じ薬の各服用時間には共通の猶予を適用します。例えば09:00、前15分・後30分なら、QR／NFCの受付は08:45以上09:30未満です。通知は予定時刻の09:00のままです。日をまたぐ受付でも服用予定日に紐づけて記録します。

変更した予定は保存以降に適用し、過去の服用履歴・確定済みのテスト決済額は変更しません。服用時間を残した編集ではIDとその日の記録を保持します。時間を削除して新規追加した場合は別の予定として扱います。

今回の変更の取得後は、既存のDevelopment Buildを使って `npm run start:node24` で起動し、アプリを **Reload** してください。DB v8への移行を起動時に実行するため、Fast Refreshのみで確認しないでください。ネイティブ構成も別途変更されている場合は従来の再ビルド手順に従います。

今回確認したのは型チェック・Lint・iOS／AndroidのJavaScriptバンドル生成です。DB移行の実行、登録・編集からQR／NFC確認までの実機動作、通知の再予約は実機確認が必要です。

### 自動テストと実機確認

`npm test`で実SQLiteを使い、猶予境界、日またぎ、未起動期間、登録前の予定除外、保存失敗時のロールバック、再起動後の二重記録防止、確認済み保持、決済失敗・再試行、端末共通QR照合、複数薬箱の割り当てとNFC照合、旧薬箱データの移行、編集・削除後の履歴保持を確認します。

実機では、薬登録 → QR表示／NFC登録 → 期限内の読み取り → 完了・次回予定 → 履歴反映を確認してください。未服用のまま期限後にアプリを開くとテスト課金結果画面になり、確認後の再起動で同じお知らせが出ないことも確認します。通知・カメラ・NFC・画面レイアウトの実機動作はバンドル／ユニットテストとは別に確認が必要です。
