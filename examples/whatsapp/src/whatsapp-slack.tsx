/** @jsxImportSource jsx-slack */
import { Trigger } from "@trigger.dev/sdk";
import {
  events,
  sendText,
  getMediaUrl,
  MessageEventMessage,
} from "@trigger.dev/whatsapp";
import JSXSlack, {
  Actions,
  Blocks,
  Button,
  Section,
  Header,
  Context,
  Image,
  Modal,
  Divider,
  Field,
  Input,
  Textarea,
} from "jsx-slack";
import * as slack from "@trigger.dev/slack";

const SLACK_BLOCK_ID = "launch.modal";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeStyle: "short",
  dateStyle: "short",
});

new Trigger({
  id: "whatsapp-to-slack",
  name: "WhatsApp: load messages",
  apiKey: "trigger_dev_zC25mKNn6c0q",
  endpoint: "ws://localhost:8889/ws",
  logLevel: "debug",
  on: events.messageEvent({
    accountId: "114848614845931",
  }),
  run: async (event, ctx) => {
    ctx.logger.debug("event", event);
    let messageBody = <></>;

    switch (event.message.type) {
      case "text": {
        messageBody = <Section>{event.message.text.body}</Section>;
        break;
      }
      case "image": {
        const mediaUrl = await getMediaUrl(`getImageUrl`, event.message.image);
        messageBody = (
          <Image src={mediaUrl} alt={event.message.image.caption ?? ""} />
        );
        break;
      }
      case "video": {
        const mediaUrl = await getMediaUrl(`getVideoUrl`, event.message.video);
        messageBody = <Section>{mediaUrl}</Section>;
        break;
      }
      default:
        messageBody = (
          <Section>Unsupported message type: {event.message.type}</Section>
        );
    }

    await slack.postMessage("jsx-test", {
      channelName: "test-integrations",
      //text appears in Slack notifications on mobile/desktop
      text: "How is your progress today?",
      //import and use JSXSlack to make creating rich messages much easier
      blocks: JSXSlack(
        <Blocks>
          <Header>From: {event.message.from}</Header>
          <Context>At: {dateFormatter.format(event.message.timestamp)}</Context>
          {messageBody}
          <Actions blockId="launch-modal">
            <Button value="reply" actionId="reply">
              Reply
            </Button>
          </Actions>
        </Blocks>
      ),
      metadata: {
        whatsAppMessage: event.message,
      },
    });
  },
}).listen();

new Trigger({
  id: "whatsapp-to-slack-modal",
  name: "WhatsApp: show message composer",
  apiKey: "trigger_dev_zC25mKNn6c0q",
  endpoint: "ws://localhost:8889/ws",
  logLevel: "debug",
  on: slack.events.blockActionInteraction({
    blockId: "launch-modal",
  }),
  run: async (event, ctx) => {
    if (!event.trigger_id) {
      await ctx.logger.error("No trigger_id", { event });
      return;
    }

    const action = event.actions[0];
    ctx;

    const whatsAppMessage =
      event.message?.metadata?.event_payload.whatsAppMessage;

    if (action.action_id === "reply" && action.type === "button") {
      await slack.openView(
        "Opening view",
        event.trigger_id,
        JSXSlack(
          <Modal title="Your reply" close="Cancel" callbackId="submit-message">
            <Textarea
              name="message"
              label="Message"
              placeholder="Your message"
              maxLength={500}
              id="messageField"
            />
            <Input type="submit" value="submit" />
          </Modal>
        ),
        {
          onSubmit: "close",
          metadata: {
            whatsAppMessage,
            thread_ts: event.message?.ts,
          },
        }
      );
    }
  },
}).listen();

new Trigger({
  id: "whatsapp-composed-slack-message",
  name: "WhatsApp: send message from Slack",
  apiKey: "trigger_dev_zC25mKNn6c0q",
  endpoint: "ws://localhost:8889/ws",
  logLevel: "debug",
  on: slack.events.viewSubmissionInteraction({
    callbackId: "submit-message",
  }),
  run: async (event, ctx) => {
    await ctx.logger.info("Modal submission", { event });

    //the message from the input field in Slack
    const usersResponse = event.view.state?.values.messageField.message
      .value as string;

    //get the data from the previous messages/panels
    const privateMetadata =
      event.view.private_metadata && JSON.parse(event.view.private_metadata);
    await ctx.logger.info("Private metadata", privateMetadata);

    const whatsAppMessage = privateMetadata?.whatsAppMessage;

    if (!whatsAppMessage || !usersResponse) {
      await ctx.logger.error("No message or original message", { event });
      return;
    }

    //send WhatsApp message
    await sendText("send-whatsapp", {
      fromId: "102119172798864",
      to: whatsAppMessage.from,
      text: usersResponse,
    });

    //send message in Slack
    await slack.postMessage("slack-reply", {
      channelName: "test-integrations",
      text: `Replied with: ${usersResponse}`,
      blocks: JSXSlack(
        <Blocks>
          <Header>Reply from @{event.user.username}</Header>
          <Context>
            At: {dateFormatter.format(new Date())} To: {whatsAppMessage.from}
          </Context>
          <Section>{usersResponse}</Section>
        </Blocks>
      ),
      thread_ts: privateMetadata?.thread_ts,
    });

    return event;
  },
}).listen();
