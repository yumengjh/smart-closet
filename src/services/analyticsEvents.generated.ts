// 自动生成，勿手改：npm run sync:analytics（来源 smart-closet-server 的 analytics/events.json）。
// version: 8

export const analyticsVersion = 8

/** 事件名 → 属性。属性只能是枚举或布尔。 */
export type AnalyticsEventProps = {
  app_open: { display: "browser" | "standalone" }
  auth_register_success: { mode: "invite" | "open" }
  auth_login_success: { method: "password" | "portable" }
  welcome_step: { step: "sex" | "feel" | "basics" | "first"; action: "done" | "skip" }
  welcome_finish: Record<string, never>
  today_swipe: { dir: "left" | "right" }
  today_worn: { via: "swipe" | "button" }
  today_detail_open: Record<string, never>
  add_open: { from: "dock" | "wardrobe" | "today" | "assistant" }
  add_source: { source: "camera" | "album" | "preset" | "quick" }
  intake_submit: { count: "1" | "2-5" | "6+"; recognize: "online" | "local"; wanted: boolean }
  garment_confirm: { action: "accept" | "edit" | "retry" }
  wardrobe_search: { filtered: boolean }
  recommend_shuffle: { where: "today" | "outfits" | "assistant" }
  recommend_swap_one: { where: "today" | "outfits" | "assistant" }
  recommend_feedback: { kind: "like" | "dislike" }
  outfit_save: { from: "recommend" | "workspace" | "assistant" }
  try_make_start: { effect: "outfit" | "creative" }
  try_make_result: { effect: "outfit" | "creative"; result: "ok" | "fail" }
  try_live_start: { source: "wardrobe" | "outfit" | "look" | "upload" }
  try_live_follow: { result: "matched" }
  try_live_result: { result: "ready" | "fail"; stage: "none" | "camera" | "network" | "pose" | "quota" }
  album_share: { kind: "download" | "share" }
  inspiration_saved: { source: "picker" | "paste" | "drop" | "share"; duplicate: boolean }
  inspiration_deleted: Record<string, never>
  inspiration_analyzed: { result: "ok" | "rejected" | "failed" }
  collection_created: Record<string, never>
  collection_item_added: { kind: "outfit" | "inspiration" }
  outfit_favorited: { on: boolean; from: "today" | "outfits" | "detail" }
  garment_marked: { field: "tags" | "note" | "purchase" }
  garment_hold_set: { status: "none" | "laundry" | "repair" | "lent" | "stored" }
  assistant_open: { entry: "dock" | "top" | "shortcut" }
  assistant_send: { image: boolean }
  assistant_layout: { mode: "bottom" | "overlay" | "dock" | "float" }
  assistant_card_open: { kind: "outfit" | "garment" | "duplicate" | "other" }
  billing_purchase: { kind: "points" | "plan"; result: "start" | "ok" | "cancel" | "fail" }
  billing_redeem: { result: "ok" | "fail" }
  pwa_install: { result: "accept" | "dismiss" }
  api_fail: { group: "auth" | "closet" | "garments" | "outfits" | "recommendations" | "agent" | "ootd" | "creation" | "tryon" | "billing" | "other"; status: "5xx" | "network" | "timeout" }
}
export type AnalyticsEventName = keyof AnalyticsEventProps

/** 允许上报的页面（路由模板与页面名）。 */
export const analyticsPages: readonly { readonly path: string; readonly name: string }[] = [
  {
    "path": "/today",
    "name": "今天"
  },
  {
    "path": "/wardrobe",
    "name": "衣柜"
  },
  {
    "path": "/pending",
    "name": "整理中"
  },
  {
    "path": "/review",
    "name": "等你确认"
  },
  {
    "path": "/tasks",
    "name": "处理进度"
  },
  {
    "path": "/add",
    "name": "添加衣物"
  },
  {
    "path": "/garment/:id",
    "name": "单品详情"
  },
  {
    "path": "/batches/:id",
    "name": "批次"
  },
  {
    "path": "/trash",
    "name": "回收站"
  },
  {
    "path": "/outfits",
    "name": "搭配"
  },
  {
    "path": "/outfits/workspace",
    "name": "搭配编辑"
  },
  {
    "path": "/outfits/:id",
    "name": "搭配编辑"
  },
  {
    "path": "/inspirations",
    "name": "穿搭收藏"
  },
  {
    "path": "/inspirations/:id",
    "name": "穿搭收藏详情"
  },
  {
    "path": "/collections/:id",
    "name": "合集"
  },
  {
    "path": "/try",
    "name": "试穿"
  },
  {
    "path": "/try/album",
    "name": "我的图"
  },
  {
    "path": "/try-on",
    "name": "镜头试穿"
  },
  {
    "path": "/vip",
    "name": "会员"
  },
  {
    "path": "/help",
    "name": "帮助"
  },
  {
    "path": "/login",
    "name": "登录"
  },
  {
    "path": "/register",
    "name": "注册"
  },
  {
    "path": "/welcome",
    "name": "首次体验"
  },
  {
    "path": "/settings",
    "name": "我的"
  },
  {
    "path": "/settings/style",
    "name": "我的·我的风格"
  },
  {
    "path": "/settings/personal",
    "name": "我的·我的形象"
  },
  {
    "path": "/settings/assistant",
    "name": "我的·鱼搭助手"
  },
  {
    "path": "/settings/tidy",
    "name": "我的·重复的衣服"
  },
  {
    "path": "/settings/quota",
    "name": "我的·次数与点数"
  },
  {
    "path": "/settings/account",
    "name": "我的·账号与安全"
  },
  {
    "path": "/settings/appearance",
    "name": "我的·外观"
  },
  {
    "path": "/settings/install",
    "name": "我的·安装"
  },
  {
    "path": "/settings/portable",
    "name": "我的·便携版"
  }
]

export type AnalyticsPropSpec = { readonly enum: readonly string[] } | { readonly type: 'boolean' }
export type AnalyticsEventSpec = { readonly phase: number; readonly billing: boolean; readonly props: Readonly<Record<string, AnalyticsPropSpec>> }

/** 运行时校验用：每个事件的期数、是否收费事件与属性定义。 */
export const analyticsEventSpecs: Readonly<Record<AnalyticsEventName, AnalyticsEventSpec>> = {
  "app_open": {
    "phase": 1,
    "billing": false,
    "props": {
      "display": {
        "enum": [
          "browser",
          "standalone"
        ]
      }
    }
  },
  "auth_register_success": {
    "phase": 1,
    "billing": false,
    "props": {
      "mode": {
        "enum": [
          "invite",
          "open"
        ]
      }
    }
  },
  "auth_login_success": {
    "phase": 2,
    "billing": false,
    "props": {
      "method": {
        "enum": [
          "password",
          "portable"
        ]
      }
    }
  },
  "welcome_step": {
    "phase": 1,
    "billing": false,
    "props": {
      "step": {
        "enum": [
          "sex",
          "feel",
          "basics",
          "first"
        ]
      },
      "action": {
        "enum": [
          "done",
          "skip"
        ]
      }
    }
  },
  "welcome_finish": {
    "phase": 1,
    "billing": false,
    "props": {}
  },
  "today_swipe": {
    "phase": 1,
    "billing": false,
    "props": {
      "dir": {
        "enum": [
          "left",
          "right"
        ]
      }
    }
  },
  "today_worn": {
    "phase": 1,
    "billing": false,
    "props": {
      "via": {
        "enum": [
          "swipe",
          "button"
        ]
      }
    }
  },
  "today_detail_open": {
    "phase": 2,
    "billing": false,
    "props": {}
  },
  "add_open": {
    "phase": 2,
    "billing": false,
    "props": {
      "from": {
        "enum": [
          "dock",
          "wardrobe",
          "today",
          "assistant"
        ]
      }
    }
  },
  "add_source": {
    "phase": 1,
    "billing": false,
    "props": {
      "source": {
        "enum": [
          "camera",
          "album",
          "preset",
          "quick"
        ]
      }
    }
  },
  "intake_submit": {
    "phase": 1,
    "billing": false,
    "props": {
      "count": {
        "enum": [
          "1",
          "2-5",
          "6+"
        ]
      },
      "recognize": {
        "enum": [
          "online",
          "local"
        ]
      },
      "wanted": {
        "type": "boolean"
      }
    }
  },
  "garment_confirm": {
    "phase": 2,
    "billing": false,
    "props": {
      "action": {
        "enum": [
          "accept",
          "edit",
          "retry"
        ]
      }
    }
  },
  "wardrobe_search": {
    "phase": 2,
    "billing": false,
    "props": {
      "filtered": {
        "type": "boolean"
      }
    }
  },
  "recommend_shuffle": {
    "phase": 2,
    "billing": false,
    "props": {
      "where": {
        "enum": [
          "today",
          "outfits",
          "assistant"
        ]
      }
    }
  },
  "recommend_swap_one": {
    "phase": 2,
    "billing": false,
    "props": {
      "where": {
        "enum": [
          "today",
          "outfits",
          "assistant"
        ]
      }
    }
  },
  "recommend_feedback": {
    "phase": 2,
    "billing": false,
    "props": {
      "kind": {
        "enum": [
          "like",
          "dislike"
        ]
      }
    }
  },
  "outfit_save": {
    "phase": 1,
    "billing": false,
    "props": {
      "from": {
        "enum": [
          "recommend",
          "workspace",
          "assistant"
        ]
      }
    }
  },
  "try_make_start": {
    "phase": 1,
    "billing": false,
    "props": {
      "effect": {
        "enum": [
          "outfit",
          "creative"
        ]
      }
    }
  },
  "try_make_result": {
    "phase": 1,
    "billing": false,
    "props": {
      "effect": {
        "enum": [
          "outfit",
          "creative"
        ]
      },
      "result": {
        "enum": [
          "ok",
          "fail"
        ]
      }
    }
  },
  "try_live_start": {
    "phase": 2,
    "billing": false,
    "props": {
      "source": {
        "enum": [
          "wardrobe",
          "outfit",
          "look",
          "upload"
        ]
      }
    }
  },
  "try_live_follow": {
    "phase": 2,
    "billing": false,
    "props": {
      "result": {
        "enum": [
          "matched"
        ]
      }
    }
  },
  "try_live_result": {
    "phase": 2,
    "billing": false,
    "props": {
      "result": {
        "enum": [
          "ready",
          "fail"
        ]
      },
      "stage": {
        "enum": [
          "none",
          "camera",
          "network",
          "pose",
          "quota"
        ]
      }
    }
  },
  "album_share": {
    "phase": 2,
    "billing": false,
    "props": {
      "kind": {
        "enum": [
          "download",
          "share"
        ]
      }
    }
  },
  "inspiration_saved": {
    "phase": 2,
    "billing": false,
    "props": {
      "source": {
        "enum": [
          "picker",
          "paste",
          "drop",
          "share"
        ]
      },
      "duplicate": {
        "type": "boolean"
      }
    }
  },
  "inspiration_deleted": {
    "phase": 2,
    "billing": false,
    "props": {}
  },
  "inspiration_analyzed": {
    "phase": 2,
    "billing": false,
    "props": {
      "result": {
        "enum": [
          "ok",
          "rejected",
          "failed"
        ]
      }
    }
  },
  "collection_created": {
    "phase": 2,
    "billing": false,
    "props": {}
  },
  "collection_item_added": {
    "phase": 2,
    "billing": false,
    "props": {
      "kind": {
        "enum": [
          "outfit",
          "inspiration"
        ]
      }
    }
  },
  "outfit_favorited": {
    "phase": 2,
    "billing": false,
    "props": {
      "on": {
        "type": "boolean"
      },
      "from": {
        "enum": [
          "today",
          "outfits",
          "detail"
        ]
      }
    }
  },
  "garment_marked": {
    "phase": 2,
    "billing": false,
    "props": {
      "field": {
        "enum": [
          "tags",
          "note",
          "purchase"
        ]
      }
    }
  },
  "garment_hold_set": {
    "phase": 2,
    "billing": false,
    "props": {
      "status": {
        "enum": [
          "none",
          "laundry",
          "repair",
          "lent",
          "stored"
        ]
      }
    }
  },
  "assistant_open": {
    "phase": 1,
    "billing": false,
    "props": {
      "entry": {
        "enum": [
          "dock",
          "top",
          "shortcut"
        ]
      }
    }
  },
  "assistant_send": {
    "phase": 2,
    "billing": false,
    "props": {
      "image": {
        "type": "boolean"
      }
    }
  },
  "assistant_layout": {
    "phase": 2,
    "billing": false,
    "props": {
      "mode": {
        "enum": [
          "bottom",
          "overlay",
          "dock",
          "float"
        ]
      }
    }
  },
  "assistant_card_open": {
    "phase": 2,
    "billing": false,
    "props": {
      "kind": {
        "enum": [
          "outfit",
          "garment",
          "duplicate",
          "other"
        ]
      }
    }
  },
  "billing_purchase": {
    "phase": 2,
    "billing": true,
    "props": {
      "kind": {
        "enum": [
          "points",
          "plan"
        ]
      },
      "result": {
        "enum": [
          "start",
          "ok",
          "cancel",
          "fail"
        ]
      }
    }
  },
  "billing_redeem": {
    "phase": 2,
    "billing": true,
    "props": {
      "result": {
        "enum": [
          "ok",
          "fail"
        ]
      }
    }
  },
  "pwa_install": {
    "phase": 2,
    "billing": false,
    "props": {
      "result": {
        "enum": [
          "accept",
          "dismiss"
        ]
      }
    }
  },
  "api_fail": {
    "phase": 2,
    "billing": false,
    "props": {
      "group": {
        "enum": [
          "auth",
          "closet",
          "garments",
          "outfits",
          "recommendations",
          "agent",
          "ootd",
          "creation",
          "tryon",
          "billing",
          "other"
        ]
      },
      "status": {
        "enum": [
          "5xx",
          "network",
          "timeout"
        ]
      }
    }
  }
}
