const { InteractionType } = require("discord.js");
const { handleSourceButtonInteraction, SOURCE_BUTTON_ID } = require("../ui/components");

/**
 * Handle Discord interactionCreate events (buttons, slash commands, etc.)
 * @param {Interaction} interaction - Discord interaction object
 */
async function handleInteractionCreate(interaction) {
  if (interaction.type !== InteractionType.MessageComponent) return;
  
  if (interaction.customId.startsWith(SOURCE_BUTTON_ID)) {
    console.log(`[INTERACTION] Source button clicked by ${interaction.user.username}`);
    await handleSourceButtonInteraction(interaction);
  }
}

module.exports = {
  handleInteractionCreate
};
