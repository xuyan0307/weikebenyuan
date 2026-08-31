# 微可本源安卓端

这是一个加载正式站点 `https://weikebenyuan.com` 的轻量安卓应用壳。

## 更新机制

- 业务页面、接口和数据仍由正式服务器统一提供，网页发布后 APK 会自动使用新版本，无需重新安装。
- 仅当包名、图标、原生权限、文件选择或其他 Android 原生能力变化时，才需要重新构建并安装 APK。
- 登录 Cookie 保存在 Android WebView 中，和手机浏览器互相独立。

## 构建

需要 JDK 17 和 Android SDK 35，项目已包含 Gradle Wrapper：

```powershell
.\gradlew.bat assembleDebug
```

内部安装包位于 `app/build/outputs/apk/debug/app-debug.apk`，已使用 Android 调试证书签名，可以直接安装。正式上架应用商店前应改用长期保存的独立发布证书。
