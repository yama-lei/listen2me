# OneBot 事件系统结构详解

本文档详细说明 OneBot 事件系统的架构、事件类型及其继承关系。

## 一、事件可用性说明

### meta_event 事件

| 事件名                         | 说明                     | 可用 | 备注                           |
| ------------------------------ | ------------------------ | ---- | ------------------------------ |
| meta_event.lifecycle           | 生命周期                 | ✅   |                                |
| meta_event.lifecycle.enable   | 生命周期 - OneBot 启用   | ❌   |                                |
| meta_event.lifecycle.disable  | 生命周期 - OneBot 停用   | ❌   |                                |
| meta_event.lifecycle.connect  | 生命周期 - WebSocket 连接成功 | ✅   |                                |
| meta_event.heartbeat          | 心跳                     | ✅   |                                |

### message 事件

| 事件名                             | 说明                 | 可用 | 备注                           |
| ---------------------------------- | -------------------- | ---- | ------------------------------ |
| message.private                    | 私聊消息             | ✅   |                                |
| message.private.friend             | 私聊消息 - 好友      | ✅   |                                |
| message.private.group              | 私聊消息 - 群临时    | ✅   |                                |
| message.private.group_self         | 私聊消息 - 群中自身发送 | ❌   |                                |
| message.private.other              | 私聊消息 - 其他      | ❌   |                                |
| message.group                      | 群聊消息             | ✅   |                                |
| message.group.normal               | 群聊消息 - 普通      | ✅   |                                |
| message.group.notice               | 群聊消息 - 系统提示  | ❌   |                                |

### message_sent 事件

| 事件名                                 | 说明                 | 可用 | 备注                           |
| -------------------------------------- | -------------------- | ---- | ------------------------------ |
| message_sent.private                   | 私聊消息             | ✅   |                                |
| message_sent.private.friend            | 私聊消息 - 好友      | ✅   |                                |
| message_sent.private.group             | 私聊消息 - 群临时    | ✅   |                                |
| message_sent.private.group_self        | 私聊消息 - 群中自身发送 | ❌   |                                |
| message_sent.private.other             | 私聊消息 - 其他      | ❌   |                                |
| message_sent.group                     | 群聊消息             | ✅   |                                |
| message_sent.group.normal              | 群聊消息 - 普通      | ✅   |                                |
| message_sent.group.notice              | 群聊消息 - 系统提示  | ❌   |                                |

### request 事件

| 事件名                    | 说明               | 可用 | 备注 |
| ------------------------- | ------------------ | ---- | ---- |
| request.friend            | 加好友请求         | ✅   |      |
| request.group.add         | 加群请求           | ✅   |      |
| request.group.invite      | 邀请登录号入群     | ✅   |      |

### notice 事件

| 事件名                                      | 说明                     | 可用 | 备注                           |
| ------------------------------------------- | ------------------------ | ---- | ------------------------------ |
| notice.friend_add                           | 好友添加                 | ✅   |                                |
| notice.friend_recall                        | 私聊消息撤回             | ✅   |                                |
| notice.offline_file                         | 接收到离线文件           | ❌   |                                |
| notice.client_status                        | 其他客户端在线状态变更   | ❌   |                                |
| notice.group_admin                          | 群聊管理员变动           | ✅   |                                |
| notice.group_admin.set                      | 群聊管理员变动 - 增加    | ✅   |                                |
| notice.group_admin.unset                    | 群聊管理员变动 - 减少    | ✅   |                                |
| notice.group_ban                            | 群聊禁言                 | ✅   |                                |
| notice.group_ban.ban                        | 群聊禁言 - 禁言          | ✅   |                                |
| notice.group_ban.lift_ban                   | 群聊禁言 - 取消禁言      | ✅   |                                |
| notice.group_card                           | 群成员名片更新           | ✅   |                                |
| notice.group_decrease                       | 群聊成员减少             | ✅   |                                |
| notice.group_decrease.leave                 | 群聊成员减少 - 主动退群  | ✅   |                                |
| notice.group_decrease.kick                  | 群聊成员减少 - 成员被踢  | ✅   |                                |
| notice.group_decrease.kick_me               | 群聊成员减少 - 登录号被踢 | ✅   |                                |
| notice.group_increase                       | 群聊成员增加             | ✅   |                                |
| notice.group_increase.approve               | 群聊成员增加 - 管理员已同意入群 | ✅   |                                |
| notice.group_increase.invite                | 群聊成员增加 - 管理员邀请入群 | ✅   |                                |
| notice.group_recall                         | 群聊消息撤回             | ✅   |                                |
| notice.group_upload                         | 群聊文件上传             | ✅   |                                |
| notice.group_msg_emoji_like                 | 群聊表情回应             | ⏹   | 仅收自己的 其余扩展接口拉取    |
| notice.essence                              | 群聊设精                 | ✅   |                                |
| notice.essence.add                          | 群聊设精 - 增加          | ✅   |                                |
| notice.notify.poke                          | 戳一戳                   | ✅   |                                |
| notice.notify.input_status                  | 输入状态更新             | ✅   |                                |
| notice.notify.title                         | 群成员头衔变更           | ✅   |                                |
| notice.notify.profile_like                  | 点赞                     | ✅   |                                |

---

## 二、OneBot 11 事件基础结构与消息结构

### 1. 事件基础字段

所有事件都包含以下基础字段：

| 字段名      | 类型   | 说明                     |
| ----------- | ------ | ------------------------ |
| `time`      | number | 事件发生的时间戳（秒）   |
| `post_type` | string | 事件类型                 |
| `self_id`   | number | 收到事件的机器人 QQ 号   |

**示例：**

```json
{
  "time": 1718000000,
  "post_type": "message",
  "self_id": 123456789
}
```

### 2. 消息事件结构

消息事件是最常见的事件类型，分为私聊消息和群消息。

#### 2.1 私聊消息（OB11PrivateMessage）

| 字段名         | 类型               | 说明                               |
| -------------- | ------------------ | ---------------------------------- |
| `time`         | number             | 事件发生时间戳                     |
| `post_type`    | 'message' \| 'message_sent' | 事件类型                           |
| `message_type` | 'private'          | 消息类型：私聊                     |
| `sub_type`     | 'friend'           | 子类型：好友                       |
| `message_id`   | number             | 消息 ID                            |
| `user_id`      | number             | 发送者 QQ 号                       |
| `message`      | OB11Segment[]      | 消息段数组                         |
| `raw_message`  | string             | 原始消息内容                       |
| `font`         | number             | 字体                               |
| `target_id`    | ?number            | 临时会话目标 QQ 号（可选）         |
| `temp_source`  | ?number            | 临时会话来源（可选）               |
| `sender`       | FriendSender       | 发送者信息                         |
| `self_id`      | number             | 机器人 QQ 号                       |

**私聊消息示例：**

```json
{
  "time": 1718000000,
  "post_type": "message",
  "message_type": "private",
  "sub_type": "friend",
  "message_id": 1001,
  "user_id": 234567890,
  "message": [
    { "type": "text", "data": { "text": "你好" } }
  ],
  "raw_message": "你好",
  "font": 0,
  "sender": {
    "user_id": 234567890,
    "nickname": "小明",
    "sex": "male",
    "age": 18
  },
  "self_id": 123456789
}
```

**临时会话私聊消息示例：**

```json
{
  "time": 1718000002,
  "post_type": "message",
  "message_type": "private",
  "sub_type": "group",
  "message_id": 1002,
  "user_id": 234567891,
  "target_id": 987654321,
  "temp_source": 0,
  "message": [
    { "type": "text", "data": { "text": "临时会话消息" } }
  ],
  "raw_message": "临时会话消息",
  "font": 0,
  "sender": {
    "user_id": 234567891,
    "nickname": "小红",
    "sex": "female"
  },
  "self_id": 123456789
}
```

#### 2.2 群消息（OB11GroupMessage）

| 字段名         | 类型               | 说明                               |
| -------------- | ------------------ | ---------------------------------- |
| `time`         | number             | 事件发生时间戳                     |
| `post_type`    | 'message' \| 'message_sent' | 事件类型                           |
| `message_type` | 'group'            | 消息类型：群聊                     |
| `sub_type`     | 'normal' \| 'anonymous' \| 'notice' | 子类型                             |
| `message_id`   | number             | 消息 ID                            |
| `user_id`      | number             | 发送者 QQ 号                       |
| `group_id`     | number             | 群号                               |
| `message`      | OB11Segment[]      | 消息段数组                         |
| `raw_message`  | string             | 原始消息内容                       |
| `font`         | number             | 字体                               |
| `sender`       | GroupSender        | 发送者信息                         |
| `self_id`      | number             | 机器人 QQ 号                       |

**普通群消息示例：**

```json
{
  "time": 1718000001,
  "post_type": "message",
  "message_type": "group",
  "sub_type": "normal",
  "message_id": 2002,
  "user_id": 345678901,
  "group_id": 987654321,
  "message": [
    { "type": "at", "data": { "qq": 123456789 } },
    { "type": "text", "data": { "text": "大家好！" } }
  ],
  "raw_message": "[CQ:at,qq=123456789]大家好！",
  "font": 0,
  "sender": {
    "user_id": 345678901,
    "nickname": "群友A",
    "sex": "female",
    "card": "管理员",
    "role": "admin"
  },
  "self_id": 123456789
}
```

### 3. 通知事件结构（Notice Event）

通知事件用于描述平台自动推送的各种状态变更、操作通知，如群成员变动、消息撤回、禁言等。

| 字段名       | 类型   | 说明                     |
| ------------ | ------ | ------------------------ |
| `time`       | number | 事件发生时间戳           |
| `post_type`  | 'notice' | 事件类型                 |
| `self_id`    | number | 收到事件的机器人 QQ 号   |
| `notice_type`| string | 通知类型（见下表）       |

**常见通知类型及主要字段：**

| `notice_type`             | 说明               | 主要字段                                                  | 补充说明                           |
| ------------------------- | ------------------ | --------------------------------------------------------- | ---------------------------------- |
| `group_upload`            | 群文件上传         | `group_id`, `user_id`, `file` (id, name, size, busid)    |                                    |
| `group_admin`             | 群管理员变动       | `sub_type`: 'set'/'unset', `group_id`, `user_id`          |                                    |
| `group_decrease`          | 群成员减少         | `sub_type`: 'leave'/'kick'/'kick_me', `group_id`, `operator_id`, `user_id` |                                    |
| `group_increase`          | 群成员增加         | `sub_type`: 'approve'/'invite', `group_id`, `operator_id`, `user_id` |                                    |
| `group_ban`               | 群禁言             | `sub_type`: 'ban'/'lift_ban', `group_id`, `operator_id`, `user_id`, `duration` |                                    |
| `friend_add`              | 新添加好友         | `user_id`                                                 |                                    |
| `group_recall`            | 群消息撤回         | `group_id`, `user_id`, `operator_id`, `message_id`        |                                    |
| `friend_recall`           | 好友消息撤回       | `user_id`, `message_id`                                   |                                    |
| `poke`                    | 戳一戳             | `sub_type`: 'poke', `group_id?`, `user_id`, `target_id`   |                                    |
| `lucky_king`              | 运气王             | `sub_type`: 'lucky_king', `group_id`, `user_id`, `target_id` |                                    |
| `honor`                   | 荣誉变更           | `sub_type`: 'honor', `group_id`, `honor_type`, `user_id`  |                                    |
| `group_msg_emoji_like`    | 群表情回应         | `group_id`, `user_id`/`operator_id`, `message_id`, `likes`/`code`, `count` |                                    |
| `essence`                 | 群精华             | `sub_type`: 'add'/'delete', `group_id`, `message_id`, `sender_id`, `operator_id` |                                    |
| `group_card`              | 群名片变更         | `group_id`, `user_id`, `card_new`, `card_old`             |                                    |

**群成员增加通知示例：**

```json
{
  "time": 1718000010,
  "post_type": "notice",
  "notice_type": "group_increase",
  "group_id": 987654321,
  "operator_id": 123456789,
  "user_id": 345678902,
  "sub_type": "invite",
  "self_id": 123456789
}
```

**群禁言通知示例：**

```json
{
  "time": 1718000011,
  "post_type": "notice",
  "notice_type": "group_ban",
  "group_id": 987654321,
  "operator_id": 123456789,
  "user_id": 345678903,
  "duration": 600,
  "sub_type": "ban",
  "self_id": 123456789
}
```

### 4. 请求事件结构（Request Event）

请求事件用于描述需要机器人处理的请求，如加好友、加群等。

| 字段名         | 类型   | 说明                     |
| -------------- | ------ | ------------------------ |
| `time`         | number | 事件发生时间戳           |
| `post_type`    | 'request' | 事件类型                 |
| `self_id`      | number | 收到事件的机器人 QQ 号   |
| `request_type` | 'friend'/'group' | 请求类型                 |
| `flag`         | string | 请求 flag                |
| `user_id`      | number | 发送请求的 QQ 号         |
| `comment`      | string | 验证信息                 |

**不同请求类型的补充字段：**

| `request_type` | 说明         | 主要字段                                              | 补充说明                           |
| -------------- | ------------ | ----------------------------------------------------- | ---------------------------------- |
| `friend`       | 好友请求     | 无                                                    |                                    |
| `group`        | 群请求       | `sub_type`: 'add'（加群申请）/'invite'（被邀请入群），`group_id` |                                    |

**加好友请求示例：**

```json
{
  "time": 1718000020,
  "post_type": "request",
  "request_type": "friend",
  "flag": "request_flag_1",
  "user_id": 456789012,
  "comment": "我是机器人粉丝",
  "self_id": 123456789
}
```

**加群申请请求示例：**

```json
{
  "time": 1718000021,
  "post_type": "request",
  "request_type": "group",
  "sub_type": "add",
  "group_id": 987654321,
  "flag": "request_flag_2",
  "user_id": 456789013,
  "comment": "想加入群聊",
  "self_id": 123456789
}
```

### 5. 消息段结构（OB11Segment）

每条消息由若干消息段（Segment）组成，每个消息段包含类型和对应数据。

| 字段名 | 类型   | 说明                               |
| ------ | ------ | ---------------------------------- |
| `type` | string | 段落类型（如 'text'）              |
| `data` | object | 各类型对应的数据内容               |

**常见 `type` 及 `data` 字段说明：**

- `text`：`{ text: string }` —— 纯文本内容
- `image`：`{ file: string, url?: string, ... }` —— 图片
- `at`：`{ qq: number }` —— @某人
- `face`：`{ id: number }` —— QQ 表情
- `reply`：`{ id: number }` —— 回复消息

**消息段示例：**

```json
[
  { "type": "text", "data": { "text": "你好" } },
  { "type": "image", "data": { "file": "abc.jpg", "url": "http://..." } },
  { "type": "at", "data": { "qq": 123456789 } },
  { "type": "face", "data": { "id": 123 } },
  { "type": "reply", "data": { "id": 1001 } }
]
```

### 6. 发送者信息结构

#### 6.1 FriendSender（私聊发送者）

| 字段名     | 类型                        | 说明                               |
| ---------- | --------------------------- | ---------------------------------- |
| `user_id`  | number                      | 发送者 QQ 号                       |
| `nickname` | string                      | 昵称                               |
| `sex`      | 'male' / 'female' / 'unknown' | 性别                               |
| `group_id` | number?                     | 群临时会话群号（可选）             |

**私聊发送者示例：**

```json
{
  "user_id": 234567890,
  "nickname": "小明",
  "sex": "male"
}
```

#### 6.2 GroupSender（群聊发送者）

| 字段名     | 类型                        | 说明                               |
| ---------- | --------------------------- | ---------------------------------- |
| `user_id`  | number                      | 发送者 QQ 号                       |
| `nickname` | string                      | 昵称                               |
| `sex`      | 'male' / 'female' / 'unknown' | 性别                               |
| `card`     | string?                     | 群名片/备注（可选）                |
| `role`     | 'owner' / 'admin' / 'member' | 角色                               |

**群聊发送者示例：**

```json
{
  "user_id": 345678901,
  "nickname": "群友A",
  "sex": "female",
  "card": "管理员",
  "role": "admin"
}
```

**说明：**

- 字段后带 `?` 表示该字段为可选项。
- 消息段（OB11Segment）可包含多种类型，具体内容以实际消息为准。
- 发送者信息结构根据消息类型（私聊/群聊）有所不同。

---

## 三、事件继承关系与详细定义

这部分并不复杂，如果你有 IDE 并初始化依赖，可以轻松理解这部分的字段和定义。

### 基础事件结构

#### OneBotEvent (基类)

所有事件的基类，定义了共有字段。

```typescript
abstract class OneBotEvent {
    time: number;         // 事件发生的时间戳
    self_id: number;      // 机器人自身 QQ 号
    abstract post_type: EventType; // 事件类型
}
```

#### 事件类型枚举

```typescript
enum EventType {
    META = 'meta_event',      // 元事件
    REQUEST = 'request',      // 请求事件
    NOTICE = 'notice',        // 通知事件
    MESSAGE = 'message',      // 消息事件
    MESSAGE_SENT = 'message_sent', // 消息发送事件
}
```

### 元事件 (Meta Event)

元事件是与协议相关的事件，如心跳、生命周期等。

#### OB11BaseMetaEvent

```typescript
abstract class OB11BaseMetaEvent extends OneBotEvent {
    post_type = EventType.META;
    abstract meta_event_type: string; // 元事件类型
}
```

#### OB11HeartbeatEvent

心跳事件，用于确认连接状态。

```typescript
interface HeartbeatStatus {
    online: boolean | undefined,  // 是否在线
    good: boolean                 // 状态是否良好
}

class OB11HeartbeatEvent extends OB11BaseMetaEvent {
    meta_event_type = 'heartbeat'; // 心跳事件
    status: HeartbeatStatus;       // 状态信息
    interval: number;              // 心跳间隔时间(ms)
}
```

#### OB11LifeCycleEvent

生命周期事件，用于通知框架生命周期变化。

```typescript
enum LifeCycleSubType {
    ENABLE = 'enable',    // 启用
    DISABLE = 'disable',  // 禁用
    CONNECT = 'connect'   // 连接
}

class OB11LifeCycleEvent extends OB11BaseMetaEvent {
    meta_event_type = 'lifecycle'; // 生命周期事件
    sub_type: LifeCycleSubType;    // 子类型
}
```

### 通知事件 (Notice Event)

通知事件用于接收各类通知，如好友添加、群组变动等。

#### OB11BaseNoticeEvent

所有通知事件的基类。

```typescript
abstract class OB11BaseNoticeEvent extends OneBotEvent {
    post_type = EventType.NOTICE;
    // 具体通知类型在子类中定义
}
```

#### 群组通知事件基类

处理群相关的通知事件。

```typescript
abstract class OB11GroupNoticeEvent extends OB11BaseNoticeEvent {
    group_id: number;  // 群号
    user_id: number;   // 用户 QQ 号
}
```

#### 好友添加通知

```typescript
class OB11FriendAddNoticeEvent extends OB11BaseNoticeEvent {
    notice_type = 'friend_add';  // 好友添加通知
    user_id: number;             // 新好友 QQ 号
}
```

#### 好友消息撤回通知

```typescript
class OB11FriendRecallNoticeEvent extends OB11BaseNoticeEvent {
    notice_type = 'friend_recall';  // 好友消息撤回
    user_id: number;                // 消息发送者 QQ 号
    message_id: number;             // 被撤回的消息 ID
}
```

#### 群消息撤回通知

```typescript
class OB11GroupRecallNoticeEvent extends OB11GroupNoticeEvent {
    notice_type = 'group_recall';  // 群消息撤回
    operator_id: number;           // 操作者 QQ 号
    message_id: number;            // 被撤回的消息 ID
}
```

#### 群成员增加通知

```typescript
class OB11GroupIncreaseEvent extends OB11GroupNoticeEvent {
    notice_type = 'group_increase';  // 群成员增加
    operator_id: number;             // 操作者 QQ 号
    sub_type: 'approve' | 'invite';  // 子类型：同意加群/邀请加群
}
```

#### 群成员减少通知

```typescript
type GroupDecreaseSubType = 'leave' | 'kick' | 'kick_me' | 'disband';

class OB11GroupDecreaseEvent extends OB11GroupNoticeEvent {
    notice_type = 'group_decrease';  // 群成员减少
    sub_type: GroupDecreaseSubType;  // 子类型：主动退群/被踢/我被踢/群解散
    operator_id: number;             // 操作者 QQ 号
}
```

#### 群管理员变动通知

```typescript
class OB11GroupAdminNoticeEvent extends OB11GroupNoticeEvent {
    notice_type = 'group_admin';       // 群管理员变动
    sub_type: 'set' | 'unset';         // 设置/取消管理员
}
```

#### 群禁言通知

```typescript
class OB11GroupBanEvent extends OB11GroupNoticeEvent {
    notice_type = 'group_ban';             // 群禁言
    operator_id: number;                   // 操作者 QQ 号
    duration: number;                      // 禁言时长(秒)
    sub_type: 'ban' | 'lift_ban';          // 禁言/解除禁言
}
```

#### 群文件上传通知

```typescript
interface GroupUploadFile {
    id: string,      // 文件 ID
    name: string,    // 文件名
    size: number,    // 文件大小(Byte)
    busid: number,   // 文件总线 ID
}

class OB11GroupUploadNoticeEvent extends OB11GroupNoticeEvent {
    notice_type = 'group_upload';  // 群文件上传
    file: GroupUploadFile;         // 文件信息
}
```

#### 群名片变更通知

```typescript
class OB11GroupCardEvent extends OB11GroupNoticeEvent {
    notice_type = 'group_card';  // 群名片变更
    card_new: string;            // 新名片
    card_old: string;            // 旧名片
}
```

#### 群名变更通知

```typescript
class OB11GroupNameEvent extends OB11GroupNoticeEvent {
    notice_type = 'notify';      // 通知
    sub_type = 'group_name';     // 群名变更
    name_new: string;            // 新群名
}
```

#### 群头衔变更通知

```typescript
class OB11GroupTitleEvent extends OB11GroupNoticeEvent {
    notice_type = 'notify';      // 通知
    sub_type = 'title';          // 头衔变更
    title: string;               // 新头衔
}
```

#### 群精华消息通知

```typescript
class OB11GroupEssenceEvent extends OB11GroupNoticeEvent {
    notice_type = 'essence';             // 精华消息
    message_id: number;                  // 消息 ID
    sender_id: number;                   // 消息发送者 QQ 号
    operator_id: number;                 // 操作者 QQ 号
    sub_type: 'add' | 'delete';          // 添加/删除精华
}
```

#### 表情回应通知

```typescript
interface MsgEmojiLike {
    emoji_id: string,   // 表情 ID
    count: number       // 回应数量
}

class OB11GroupMsgEmojiLikeEvent extends OB11GroupNoticeEvent {
    notice_type = 'group_msg_emoji_like';  // 表情回应
    message_id: number;                    // 消息 ID
    likes: MsgEmojiLike[];                 // 表情信息列表
}
```

#### 戳一戳通知

```typescript
class OB11PokeEvent extends OB11BaseNoticeEvent {
    notice_type = 'notify';    // 通知
    sub_type = 'poke';         // 戳一戳
    target_id: number;         // 被戳者 QQ 号
    user_id: number;           // 戳者 QQ 号
}

class OB11FriendPokeEvent extends OB11PokeEvent {
    raw_info: unknown;         // 原始信息
    sender_id: number;         // 发送者 QQ 号
}

class OB11GroupPokeEvent extends OB11PokeEvent {
    group_id: number;          // 群号
    raw_info: unknown;         // 原始信息
}
```

#### 个人资料点赞通知

```typescript
class OB11ProfileLikeEvent extends OB11BaseNoticeEvent {
    notice_type = 'notify';        // 通知
    sub_type = 'profile_like';     // 资料点赞
    operator_id: number;           // 操作者 QQ 号
    operator_nick: string;         // 操作者昵称
    times: number;                 // 点赞次数
    time: number;                  // 时间戳
}
```

#### 输入状态通知

```typescript
class OB11InputStatusEvent extends OB11BaseNoticeEvent {
    notice_type = 'notify';        // 通知
    sub_type = 'input_status';     // 输入状态
    status_text: string;           // 状态文本
    event_type: number;            // 事件类型
    user_id: number;               // 用户 QQ 号
    group_id: number;              // 群号(如适用)
}
```

#### 机器人离线通知

```typescript
class BotOfflineEvent extends OB11BaseNoticeEvent {
    notice_type = 'bot_offline';   // 机器人离线
    user_id: number;               // 机器人 QQ 号
    tag: string;                   // 标签
    message: string;               // 离线消息
}
```

### 请求事件 (Request Event)

请求事件用于处理各类需要回应的请求，如好友请求、加群请求等。

#### 好友请求事件

```typescript
class OB11FriendRequestEvent extends OB11BaseNoticeEvent { // 注意：post_type 为 REQUEST
    post_type = EventType.REQUEST;  // 请求事件
    request_type = 'friend';        // 好友请求
    user_id: number;                // 请求者 QQ 号
    comment: string;                // 验证信息
    flag: string;                   // 请求标识
}
```

#### 群请求事件

```typescript
class OB11GroupRequestEvent extends OB11GroupNoticeEvent { // 注意：post_type 为 REQUEST
    post_type = EventType.REQUEST;  // 请求事件
    request_type = 'group';         // 群请求
    user_id: number;                // 请求者 QQ 号
    comment: string;                // 验证信息
    flag: string;                   // 请求标识
    sub_type: string;               // 请求子类型
}
```

### 消息事件 (Message Event)

消息事件用于接收各类消息，包括私聊和群聊消息。

#### OB11BaseMessageEvent

所有消息事件的基类。

```typescript
abstract class OB11BaseMessageEvent extends OneBotEvent {
    post_type = EventType.MESSAGE;  // 消息事件
    // 具体消息类型在子类中定义
    message_id: number;             // 消息 ID
    user_id: number;                // 发送者 QQ 号
    message: string | any[];        // 消息内容
    raw_message: string;            // 原始消息内容
}
```

#### 私聊消息事件

```typescript
class OB11PrivateMessageEvent extends OB11BaseMessageEvent {
    message_type = 'private';                // 私聊消息
    sub_type: 'friend' | 'group' | 'other';  // 子类型
    sender: {                                // 发送者信息
        user_id: number,                     // QQ 号
        nickname: string,                    // 昵称
        sex: 'male' | 'female' | 'unknown',  // 性别
        age: number                          // 年龄
    };
}
```

#### 群聊消息事件

```typescript
class OB11GroupMessageEvent extends OB11BaseMessageEvent {
    message_type = 'group';          // 群聊消息
    group_id: number;                // 群号
    anonymous: any | null;           // 匿名信息
    sender: {                        // 发送者信息
        user_id: number,             // 发送者 QQ 号
        nickname: string,            // 昵称
        card: string,                // 群名片
        role: 'owner' | 'admin' | 'member', // 角色
        title: string,               // 专属头衔
        level: string                // 成员等级
    };
}
```

#### 消息发送事件

```typescript
class OB11MessageSentEvent extends OB11BaseMessageEvent {
    post_type = EventType.MESSAGE_SENT; // 消息发送事件
    message_type: 'private' | 'group';  // 消息类型
    target_id: number;                  // 目标 ID（好友 QQ 号或群号）
    // 其他字段根据消息类型不同而变化
}
```

### 事件继承关系总结

```
OneBotEvent
│
├── OB11BaseMetaEvent
│   ├── OB11HeartbeatEvent
│   └── OB11LifeCycleEvent
│
├── OB11BaseNoticeEvent
│   ├── OB11FriendAddNoticeEvent
│   ├── OB11FriendRecallNoticeEvent
│   ├── OB11PokeEvent
│   │   ├── OB11FriendPokeEvent
│   │   └── OB11GroupPokeEvent
│   ├── OB11InputStatusEvent
│   ├── OB11ProfileLikeEvent
│   ├── BotOfflineEvent
│   ├── OB11GroupNoticeEvent
│   │   ├── OB11GroupAdminNoticeEvent
│   │   ├── OB11GroupBanEvent
│   │   ├── OB11GroupCardEvent
│   │   ├── OB11GroupDecreaseEvent
│   │   ├── OB11GroupEssenceEvent
│   │   ├── OB11GroupIncreaseEvent
│   │   ├── OB11GroupMsgEmojiLikeEvent
│   │   ├── OB11GroupNameEvent
│   │   ├── OB11GroupRecallNoticeEvent
│   │   ├── OB11GroupTitleEvent
│   │   └── OB11GroupUploadNoticeEvent
│
├── OB11FriendRequestEvent (继承自 OB11BaseNoticeEvent, 但 post_type 为 REQUEST)
│
├── OB11GroupRequestEvent (继承自 OB11GroupNoticeEvent, 但 post_type 为 REQUEST)
│
├── OB11BaseMessageEvent
│   ├── OB11PrivateMessageEvent
│   └── OB11GroupMessageEvent
│
└── OB11MessageSentEvent
```

### 事件类型总览表

| 事件类型         | 描述                     | 主要子类型                                       |
| ---------------- | ------------------------ | ------------------------------------------------ |
| 元事件 (Meta)    | 与协议相关的系统事件     | 心跳、生命周期                                   |
| 通知事件 (Notice)| 各类通知事件             | 好友添加、群组变动、消息撤回等                   |
| 请求事件 (Request)| 需要回应的请求事件       | 好友请求、加群请求                               |
| 消息事件 (Message)| 接收和发送的消息         | 私聊消息、群聊消息                               |

### 事件处理流程

1.  接收事件数据
2.  根据 `post_type` 字段识别事件大类
3.  根据具体事件类型（如 `notice_type`、`meta_event_type` 等）确定子类型
4.  实例化对应的事件对象
5.  传递给事件处理器进行处理
