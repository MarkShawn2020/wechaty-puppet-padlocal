import { Message } from "padlocal-client-ts/dist/proto/padlocal_pb";
import {
  Puppet,
  FriendshipPayloadConfirm,
  FriendshipPayloadVerify,
  FriendshipSceneType,
  FriendshipType,
} from "wechaty-puppet";
import { FriendshipPayloadReceive, FriendshipSource } from "wechaty-puppet/src/schemas/friendship";
import { isContactId, isIMContactId } from "../utils/is-type";
import { xmlToJson } from "../utils/xml-to-json";
import { MessageParserRetType } from "./message-parser";
import { WechatMessageType } from "./WechatMessageType";

const FRIENDSHIP_CONFIRM_REGEX_LIST = [
  /^You have added (.+) as your WeChat contact. Start chatting!$/,
  /^你已添加了(.+)，现在可以开始聊天了。$/,
  /I've accepted your friend request. Now let's chat!$/,
  /^(.+) just added you to his\/her contacts list. Send a message to him\/her now!$/,
  /^(.+)刚刚把你添加到通讯录，现在可以开始聊天了。$/,
  /^我通过了你的朋友验证请求，现在我们可以开始聊天了$/,
];

const FRIENDSHIP_VERIFY_REGEX_LIST = [
  /^(.+) has enabled Friend Confirmation/,
  /^(.+)开启了朋友验证，你还不是他（她）朋友。请先发送朋友验证请求，对方验证通过后，才能聊天。/,
];

const friendshipTypeMap: { [scene: string]: FriendshipSceneType } = {
  "1": FriendshipSceneType.QQ,
  "2": FriendshipSceneType.Email,
  "3": FriendshipSceneType.Weixin,
  "12": FriendshipSceneType.QQtbd,
  "14": FriendshipSceneType.Room,
  "15": FriendshipSceneType.Phone,
  "17": FriendshipSceneType.Card,
  "18": FriendshipSceneType.Location,
  "25": FriendshipSceneType.Bottle,
  "29": FriendshipSceneType.Shaking,
  "30": FriendshipSceneType.QRCode,
};

interface ReceiveXmlSchema {
  msg: {
    $: {
      fromusername: string;
      encryptusername: string;
      content: string;
      scene: string;
      ticket: string;
      sourceusername?: string;
      sourcenickname?: string;
      sharecardusername?: string;
      sharecardnickname?: string;
    };
  };
}

const isConfirm = (message: Message.AsObject): boolean => {
  return FRIENDSHIP_CONFIRM_REGEX_LIST.some((regexp) => {
    return !!message.content.match(regexp);
  });
};

const isNeedVerify = (message: Message.AsObject): boolean => {
  return FRIENDSHIP_VERIFY_REGEX_LIST.some((regexp) => {
    return !!message.content.match(regexp);
  });
};

const isReceive = async (message: Message.AsObject): Promise<ReceiveXmlSchema | null> => {
  if (message.type !== WechatMessageType.VerifyMsg && message.type !== WechatMessageType.VerifyMsgEnterprise) {
    return null;
  }

  try {
    const verifyXml: ReceiveXmlSchema = await xmlToJson(message.content);
    const contactId = verifyXml.msg.$.fromusername;
    if (isContactId(contactId) && verifyXml.msg.$.encryptusername) {
      return verifyXml;
    } else if (isIMContactId(contactId)) {
      return verifyXml;
    }
  } catch (e) {
    // not receive event
  }

  return null;
};

export default async (_puppet: Puppet, message: Message.AsObject): Promise<MessageParserRetType> => {
  if (isConfirm(message)) {
    return {
      contactId: message.fromusername,
      id: message.id,
      timestamp: message.createtime,
      type: FriendshipType.Confirm,
    } as FriendshipPayloadConfirm;
  } else if (isNeedVerify(message)) {
    return {
      contactId: message.fromusername,
      id: message.id,
      timestamp: message.createtime,
      type: FriendshipType.Verify,
    } as FriendshipPayloadVerify;
  } else {
    const verifyXml = await isReceive(message);
    if (verifyXml) {
      const friendshipPayload = {
        contactId: verifyXml.msg.$.fromusername,
        hello: verifyXml.msg.$.content,
        id: message.id,
        scene: friendshipTypeMap[verifyXml.msg.$.scene] || FriendshipSceneType.Unknown,
        stranger: verifyXml.msg.$.encryptusername,
        ticket: verifyXml.msg.$.ticket,
        timestamp: message.createtime,
        type: FriendshipType.Receive,
      } as FriendshipPayloadReceive;
      if(verifyXml.msg.$.sourceusername || verifyXml.msg.$.sharecardnickname){
        friendshipPayload.source = {
          sourceContactId:verifyXml.msg.$.sourceusername,
          sourceName:verifyXml.msg.$.sourcenickname,
          shareCardContactId:verifyXml.msg.$.sharecardusername,
          shareCardName: verifyXml.msg.$.sharecardnickname
        } as FriendshipSource;
      }
      return friendshipPayload;
    }

    return null;
  }
};
