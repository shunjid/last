"use client";

import { createTheme } from "@mui/material/styles";

declare module "@mui/material/styles" {
  interface TypeText {
    tertiary: string;
  }

  interface TypeBackground {
    secondary: string;
    tertiary: string;
    overlay: string;
    accentSubtle: string;
    surfaceLowest: string;
    surfaceLow: string;
    surface: string;
    surfaceHigh: string;
    surfaceHighest: string;
  }

  interface PaletteColor {
    container?: string;
    onContainer?: string;
  }

  interface SimplePaletteColorOptions {
    container?: string;
    onContainer?: string;
  }

  interface Palette {
    accent: {
      fg: string;
    };
    code: {
      comment: string;
      constant: string;
      function: string;
      keyword: string;
      link: string;
      parameter: string;
      punctuation: string;
      string: string;
    };
    outline: {
      default: string;
      subtle: string;
      accent: string;
      focus: string;
      error: string;
      warning: string;
      success: string;
    };
    link: {
      main: string;
      hover: string;
    };
    shadow: {
      key: string;
      ambient: string;
    };
  }

  interface PaletteOptions {
    accent?: Palette["accent"];
    code?: Palette["code"];
    outline?: Palette["outline"];
    link?: Palette["link"];
    shadow?: Palette["shadow"];
  }
}

const sans = "var(--font-sans), system-ui, -apple-system, Segoe UI, sans-serif";
const mono = "var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace";

const emerald = {
  50: "#ecfdf5",
  100: "#d0fae5",
  200: "#a4f4cf",
  300: "#5ee9b5",
  400: "#00d492",
  500: "#00bc7d",
  600: "#009966",
  700: "#007a55",
  800: "#006045",
  900: "#004f3b",
  950: "#002c22",
};

export const theme = createTheme({
  cssVariables: {
    colorSchemeSelector: "data-theme",
  },

  colorSchemes: {
    light: {
      palette: {
        primary: {
          main: emerald[700],
          light: emerald[400],
          dark: emerald[800],
          contrastText: "#ffffff",
          container: "#c7f1df",
          onContainer: "#00382a",
        },
        secondary: {
          main: "#4a635a",
          light: "#6c847a",
          dark: "#31473f",
          contrastText: "#ffffff",
          container: "#cfe9de",
          onContainer: "#1c3b31",
        },
        error: {
          main: "#c2372c",
          dark: "#8e2018",
          light: "#e8837a",
          container: "#fadad6",
          onContainer: "#5f1610",
        },
        warning: {
          main: "#a15c00",
          dark: "#7a4400",
          light: "#e2a03f",
          container: "#ffdfb4",
          onContainer: "#4d2c00",
        },
        success: {
          main: "#3f8416",
          dark: "#316d18",
          light: "#94cf6e",
          container: "#cdefb4",
          onContainer: "#23400a",
        },
        text: {
          primary: "#0f201b",
          secondary: "#3f4f48",
          tertiary: "#5b6963",
          disabled: "#859490",
        },
        background: {
          default: "#f6fbf9",
          paper: "#ffffff",
          secondary: "#ebf2ef",
          tertiary: "#dfeae5",
          overlay: "rgba(11, 26, 21, 0.45)",
          accentSubtle: "#c7f1df",
          surfaceLowest: "#ffffff",
          surfaceLow: "#f4faf7",
          surface: "#eff6f3",
          surfaceHigh: "#e9f1ed",
          surfaceHighest: "#e3ebe7",
        },
        divider: "#e0e9e5",
        accent: { fg: emerald[800] },
        code: {
          comment: "#5b6963",
          constant: "#0550ae",
          function: "#8250df",
          keyword: "#a5202c",
          link: "#0550ae",
          parameter: "#8a3f00",
          punctuation: "#4b5a54",
          string: "#0a7d55",
        },
        outline: {
          default: "#c4d1cc",
          subtle: "#d7e3de",
          accent: "#00925f",
          focus: emerald[700],
          error: "#c96f66",
          warning: "#ac7b12",
          success: "#61a03a",
        },
        link: { main: "#1b56cf", hover: "#123f9e" },
        shadow: { key: "rgba(11, 26, 21, 0.2)", ambient: "rgba(11, 26, 21, 0.1)" },
      },
    },

    dark: {
      palette: {
        primary: {
          main: emerald[500],
          light: emerald[300],
          dark: emerald[600],
          contrastText: emerald[950],
          container: "#005f43",
          onContainer: emerald[200],
        },
        secondary: {
          main: "#b2ccc1",
          light: "#cde5da",
          dark: "#8ba79c",
          contrastText: "#1c3b31",
          container: "#24453a",
          onContainer: "#cfe9de",
        },
        error: {
          main: "#f28b7d",
          dark: "#ffb4a8",
          light: "#ffd6d0",
          container: "#6d2b23",
          onContainer: "#ffd6d0",
        },
        warning: {
          main: "#e0a34a",
          dark: "#f0bd6e",
          light: "#f7dcae",
          container: "#4d3308",
          onContainer: "#f7dcae",
        },
        success: {
          main: "#86cc57",
          dark: "#a8db85",
          light: "#c8ecb2",
          container: "#2c4a17",
          onContainer: "#c8ecb2",
        },
        text: {
          primary: "#e4ece8",
          secondary: "#a8b6b0",
          tertiary: "#98a7a1",
          disabled: "#5e6c66",
        },
        background: {
          default: "#121714",
          paper: "#19211d",
          secondary: "#1f2823",
          tertiary: "#2a352f",
          overlay: "rgba(2, 10, 8, 0.64)",
          accentSubtle: "#123f2e",
          surfaceLowest: "#0b100e",
          surfaceLow: "#141a17",
          surface: "#19211d",
          surfaceHigh: "#232b27",
          surfaceHighest: "#2e3732",
        },
        divider: "#27312d",
        accent: { fg: emerald[400] },
        code: {
          comment: "#8b9a94",
          constant: "#79c0ff",
          function: "#d2a8ff",
          keyword: "#ff7b72",
          link: "#79c0ff",
          parameter: "#ffa657",
          punctuation: "#a5b1c2",
          string: "#7ee787",
        },
        outline: {
          default: "#414e48",
          subtle: "#2c3733",
          accent: "#00a870",
          focus: emerald[400],
          error: "#a5544a",
          warning: "#8c6d2a",
          success: "#578a35",
        },
        link: { main: "#82abf8", hover: "#a8c8fa" },
        shadow: { key: "rgba(0, 0, 0, 0.5)", ambient: "rgba(0, 0, 0, 0.32)" },
      },
    },
  },

  shape: { borderRadius: 12 },

  typography: {
    fontFamily: sans,
    fontSize: 14,
    htmlFontSize: 16,
    button: { textTransform: "none", fontWeight: 500, letterSpacing: "0.00714em" },
    body1: { fontSize: "0.875rem", lineHeight: 1.55, letterSpacing: "0.0125em" },
    body2: { fontSize: "0.8125rem", lineHeight: 1.5, letterSpacing: "0.0125em" },
    caption: { fontSize: "0.75rem", lineHeight: 1.45, letterSpacing: "0.025em" },
    subtitle1: { fontSize: "1rem", fontWeight: 500, lineHeight: 1.5, letterSpacing: "0.00937em" },
    subtitle2: {
      fontSize: "0.875rem",
      fontWeight: 500,
      lineHeight: 1.43,
      letterSpacing: "0.00714em",
    },
  },

  components: {
    MuiCssBaseline: {
      styleOverrides: {
        "html, body": {
          height: "100%",
        },
        body: {
          fontSize: "0.875rem",
          lineHeight: 1.55,
          letterSpacing: "0.0125em",
          overscrollBehavior: "none",
          WebkitFontSmoothing: "antialiased",
          textRendering: "optimizeLegibility",
        },
        "input, textarea, button, select, kbd": {
          fontFamily: "inherit",
        },
        "code, pre, kbd, samp": {
          fontFamily: mono,
          letterSpacing: 0,
        },
        "#app-root": {
          height: "100%",
        },
        "::selection": {
          background: "var(--mui-palette-background-accentSubtle)",
        },
      },
    },

    MuiButtonBase: {
      defaultProps: { disableRipple: true },
    },

    MuiButton: {
      defaultProps: { disableElevation: true, size: "small" },
      styleOverrides: {
        root: {
          borderRadius: 999,
          minWidth: 0,
          gap: 8,
          letterSpacing: "0.00714em",
          transition: "background-color 120ms ease, border-color 120ms ease, box-shadow 120ms ease",
        },
        sizeSmall: {
          minHeight: 32,
          padding: "4px 14px",
          fontSize: "0.8125rem",
        },
        sizeMedium: {
          minHeight: 40,
          padding: "8px 22px",
          fontSize: "0.875rem",
        },
        sizeLarge: {
          minHeight: 48,
          padding: "12px 26px",
          fontSize: "0.9375rem",
        },
        outlined: {
          borderColor: "var(--mui-palette-outline-default)",
        },
        text: {
          paddingLeft: 12,
          paddingRight: 12,
        },
      },
    },

    MuiIconButton: {
      defaultProps: { size: "small" },
      styleOverrides: {
        root: { borderRadius: 999 },
        sizeSmall: { width: 32, height: 32 },
        sizeMedium: { width: 40, height: 40 },
      },
    },

    MuiTooltip: {
      defaultProps: { arrow: false, enterDelay: 350, disableInteractive: true },
      styleOverrides: {
        tooltip: {
          fontSize: "0.75rem",
          fontWeight: 400,
          letterSpacing: "0.025em",
          padding: "6px 10px",
          borderRadius: 4,
        },
      },
    },

    MuiMenu: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        paper: {
          borderRadius: 12,
          padding: "8px 0",
          backgroundColor: "var(--mui-palette-background-surfaceHigh)",
          boxShadow: "var(--last-elev-2)",
        },
        list: { padding: 0 },
      },
    },

    MuiMenuItem: {
      styleOverrides: {
        root: {
          minHeight: 40,
          fontSize: "0.875rem",
          letterSpacing: "0.00714em",
        },
      },
    },

    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: "none" },
      },
    },

    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 28,
          backgroundColor: "var(--mui-palette-background-surfaceHigh)",
          boxShadow: "var(--last-elev-3)",
        },
      },
    },

    MuiDialogTitle: {
      styleOverrides: {
        root: { padding: "24px 24px 16px" },
      },
    },

    MuiDialogContent: {
      styleOverrides: {
        root: { padding: "16px 24px" },
      },
    },

    MuiDialogActions: {
      styleOverrides: {
        root: { padding: "16px 24px 24px", gap: 8 },
      },
    },

    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          backgroundColor: "var(--mui-palette-background-surfaceHighest)",
        },
        notchedOutline: {
          borderColor: "transparent",
        },
        input: {
          padding: "10px 4px",
        },
      },
    },

    MuiToggleButtonGroup: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          border: "1px solid var(--mui-palette-outline-subtle)",
          padding: 2,
          gap: 2,
        },
        grouped: {
          borderRadius: "999px !important",
          border: "none",
        },
      },
    },

    MuiToggleButton: {
      styleOverrides: {
        root: {
          border: "none",
          padding: "5px 9px",
          borderRadius: 999,
          "&.Mui-selected": {
            backgroundColor: "var(--mui-palette-secondary-container)",
            color: "var(--mui-palette-secondary-onContainer)",
          },
          "&.Mui-selected:hover": {
            backgroundColor: "var(--mui-palette-secondary-container)",
          },
        },
      },
    },

    MuiCircularProgress: {
      defaultProps: { size: 16, thickness: 5 },
    },

    MuiSvgIcon: {
      defaultProps: { fontSize: "small" },
    },
  },
});
