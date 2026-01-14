from lfx.base.composio.composio_base import ComposioBaseComponent


class ComposioYoutubeAPIComponent(ComposioBaseComponent):
    display_name: str = "YouTube"
    icon = "YouTube"
    documentation: str = "https://docs.composio.dev"
    app_name = "youtube"

    def set_default_tools(self):
        """Set the default tools for Youtube component.
        
        Appelle la méthode parente pour activer TOUS les outils YouTube disponibles (23 outils).
        Ne pas définir self.tools explicitement permet d'avoir accès à tous les outils.
        """
        # Appeler la méthode parente pour charger tous les outils par défaut
        super().set_default_tools()
        # Ne pas limiter self.tools pour garder tous les outils disponibles
