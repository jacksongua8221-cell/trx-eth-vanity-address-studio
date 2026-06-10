# TRX / ETH 靓号地址生成器

这是一个本地离线运行的 Windows 桌面工具，用来生成 **TRX / ETH 靓号地址**。

大白话说：你填一个想要的尾号，比如 `8888`、`888888`，软件就在你电脑本地不断随机生成钱包地址，直到找到符合规则的地址。生成出来的私钥和助记词可以导入真实钱包，所以一定要自己保管好。

[Release 下载](https://github.com/jacksongua8221-cell/trx-eth-vanity-address-studio/releases) | [中文详情](./README.zh-CN.md)

> 全程本地运行，不上传私钥、不上传助记词、不上传地址、不上传任务记录。

## 软件截图

### 靓号生成

![靓号生成页面](./docs/images/generator-page.png)

### 靓号筛选

![靓号筛选页面](./docs/images/filter-page.png)

## 这个软件能做什么

- 生成 TRX 靓号地址。
- 生成 ETH 靓号地址。
- 支持私钥生成。
- 支持助记词生成。
- 支持保存私钥、保存助记词，或者两者都保存。
- 支持前缀、后缀、包含、前缀 + 后缀、前缀 + 包含、包含 + 后缀、前缀 + 包含 + 后缀。
- 支持智能识别疑似靓号。
- 支持 CPU 多线程生成。
- 线程数运行中可以直接改，不用停掉重开。
- 根据当前电脑 CPU 自动推荐线程数。
- 支持 NVIDIA GPU 状态监控：显卡名、使用率、显存、温度、功耗。
- 注意：当前版本 GPU 只做状态监控，生成任务还是 CPU 执行。
- 支持概率仪表盘：理论难度、当前尝试次数、累计命中概率、预计命中时间。
- 支持自动保存，防止中途崩溃导致结果丢失。
- 支持靓号筛选，可以导入 TXT，也可以实时同步当前生成出来的疑似靓号。
- 筛选结果里地址会高亮命中的靓号部分，私钥和助记词不会挤满表格，直接点按钮复制。

## 适合谁用

这个工具适合想自己离线生成地址的人。

比如你想要：

```text
TRX 地址尾号 8888
TRX 地址尾号 666666
ETH 地址包含 8888
ETH 地址前缀 abcd
```

就可以用这个软件一直跑。

但是要注意，靓号不是越长越容易。比如 TRX 后缀 `888888` 的理论难度非常高，不是点一下马上就一定有。

## 结果保存在哪里

目标命中结果保存到：

```text
results/results.txt
```

疑似靓号结果保存到：

```text
results/suspicious/suspicious.txt
```

TXT 每行只保存你选择的内容，例如：

```text
地址 私钥
地址 私钥 助记词
```

疑似靓号不会混进右侧目标命中列表，会单独保存，方便后面筛选。

## 疑似靓号怎么判断

疑似靓号只看后缀，不看前缀，不看中间。

```text
Txxxxxx8888  -> 命中
T8888xxxxxx  -> 不命中
Txxx8888xxx  -> 不命中
```

支持：

```text
后缀豹子号：8888 / 9999 / aaaa / 7777777 / 88888888
后缀数字顺子：12345 / 234567 / 98765 / 876543
后缀字母顺子：abcde / edcba
自定义后缀：自己一行一个填写
```

不会内置 `dead / beef / cafe / face / feed` 这种英文词。如果你想要英文尾号，自己在自定义后缀里填。

## 地址和私钥是否真实可用

是的，生成逻辑按真实链规则来：

ETH：

```text
私钥 -> secp256k1 公钥 -> Keccak-256 -> 后 20 字节 -> EIP-55 checksum 地址
```

TRX：

```text
私钥 -> secp256k1 公钥 -> Keccak-256 -> 后 20 字节 -> 加 0x41 -> Base58Check -> T 开头地址
```

测试里会用 `ethers` 校验 ETH 私钥和地址，用 `TronWeb` 校验 TRX 私钥和地址。

## 下载使用

到 Release 页面下载 Windows 便携版：

[VanityAddressStudio-v0.1.0-win-portable.zip](https://github.com/jacksongua8221-cell/trx-eth-vanity-address-studio/releases/download/v0.1.0/VanityAddressStudio-v0.1.0-win-portable.zip)

解压后双击：

```text
TRX_ETH_靓号地址生成器.exe
```

## 从源码运行

```bash
npm install
npm start
```

打包：

```bash
npm run package:portable
```

验证：

```bash
npm test
npm run verify:offline
```

## 打赏地址

欢迎大哥打赏：

```text
TEmivtvDDCqiaNW4NvX9B6ngYz9f9U8888
```

![TRX/TRC20 打赏收款码](./docs/images/trx.jpg)

## 安全提醒

- 私钥和助记词就是钱包资产凭证，谁拿到谁就能控制钱包。
- 不要把结果 TXT、截图、私钥、助记词发给别人。
- 明文保存方便，但风险更高。
- 正式使用前，建议先用空钱包导入测试。
- 电脑中毒、远程控制、截图泄露，都可能导致私钥泄露。

## License

MIT
