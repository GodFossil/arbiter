const { InteractionType } = require("discord.js");
const { handleSourceButtonInteraction, SOURCE_BUTTON_ID } = require("../ui/components");

/**
 * Handle Discord interactionCreate events (buttons, slash commands, etc.)
 * @param {Interaction} interaction - Discord interaction object
 */
async function handleInteractionCreate(interaction) {
  if (interaction.type !== InteractionType.MessageComponent) return;
  
  if (interaction.customId.startsWith(SOURCE_BUTTON_ID)) {
    const { ui } = require('../../logger');
    ui.info("Source button clicked", { 
      userId: interaction.user.id,
      username: interaction.user.username,
      buttonId: interaction.customId
    });
    await handleSourceButtonInteraction(interaction);
  }
}

module.exports = {
  handleInteractionCreate
};
