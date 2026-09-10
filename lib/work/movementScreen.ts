/**
 * Movement Screening assessment — field registry.
 *
 * Exact copy of NBP's "Strength & Conditioning" assessment template
 * (NBP Supabase template 9c9b0eb3-5307-4dee-96cb-0428716af0fa), which is the
 * movement screen used at the facility. Values are stored as free-text strings
 * in `work_movement_screens.responses`, keyed by the stable `key` below.
 *
 * `nbpElementId` is the element id inside NBP's template schema — the key each
 * NBP submission's `responses` JSONB uses. The NBP import maps element id → key.
 */

export type ScreenField = {
  key: string
  label: string
  nbpElementId: string
}

export const MOVEMENT_SCREEN_FIELDS: ScreenField[] = [
  { key: 'height_in',              label: 'Height (in)',                              nbpElementId: 'el_1773859265531_u63o' },
  { key: 'weight_lbs',             label: 'Weight (lbs)',                             nbpElementId: 'el_1773859322496_egtp' },
  { key: 'glasses',                label: 'Glasses (Y/N)',                            nbpElementId: 'el_1773859352488_mp2m' },
  { key: 'previous_surgeries',     label: 'Previous Surgeries',                       nbpElementId: 'el_1773859364832_bx8k' },
  { key: 'training_age',           label: 'Training age',                             nbpElementId: 'el_1784574577732_a1bf' },
  { key: 'grip_strength_rl',       label: 'Grip Strength (R/L)',                      nbpElementId: 'el_1773859395784_yt8n' },
  { key: 'pushups_to_failure',     label: 'Pushups to Failure',                       nbpElementId: 'el_1773859423241_tg13' },
  { key: 'vertical_jump_in',       label: 'Vertical Jump (in)',                       nbpElementId: 'el_1773859439220_deqv' },
  { key: 'seated_vertical_jump_in', label: 'Seated Vertical Jump (in)',               nbpElementId: 'el_1773859465902_sqnz' },
  { key: 'approach_vertical_jump_in', label: 'Approach Vertical Jump (in)',           nbpElementId: 'el_1773859486167_16lr' },
  { key: 'depth_drop_jump_in',     label: 'Depth Drop Jump (in)',                     nbpElementId: 'el_1773859505027_k5ke' },
  { key: 'trap_bar_jump_in',       label: 'Trap Bar Jump (in)',                       nbpElementId: 'el_1773859533334_qaap' },
  { key: 'cmj_in',                 label: 'Counter-Movement Jump',                    nbpElementId: 'el_1784576305521_1q1l' },
  { key: 'broad_jump_in',          label: 'Broad Jump (in)',                          nbpElementId: 'el_1773859548371_4gy1' },
  { key: 'sl_broad_jump_rl_in',    label: 'SL Broad Jump R/L (in)',                   nbpElementId: 'el_1773859628596_n9bz' },
  { key: 'hip_er_ir_rl',           label: 'Hip ER/IR R/L',                            nbpElementId: 'el_1773859674788_cb0t' },
  { key: 'shoulder_er_ir_rl',      label: 'Shoulder ER/IR R/L',                       nbpElementId: 'el_1773859693148_s16d' },
  { key: 'ankle_mobility_rl',      label: 'Ankle Mobility R/L',                       nbpElementId: 'el_1773859705347_5tyv' },
  { key: 'wrist_mobility_rl',      label: 'Wrist Mobility R/L',                       nbpElementId: 'el_1773859713246_nfre' },
  { key: 'tspine_flex_ext_rom',    label: 'T-Spine Flexion Extension ROM',            nbpElementId: 'el_1773859721045_kyc4' },
  { key: 'tspine_rotation',        label: 'T-Spine Rotation',                         nbpElementId: 'el_1784574641416_6cs6' },
  { key: 'mb_scoop_toss_velo_mph', label: 'Rotational Med Ball Scoop Toss Velo (mph)', nbpElementId: 'el_1773859569168_5rdu' },
  { key: 'sprint_10yd_sec',        label: '10 Yard Sprint (Sec)',                     nbpElementId: 'el_1773859733771_tx4d' },
  { key: 'nordic_hamstring',       label: 'Nordic Hamstring Strength Test',           nbpElementId: 'el_1773859772914_hmke' },
  { key: 'trap_bar_deadlift_xbw',  label: 'Trap Bar Deadlift (X BW)',                 nbpElementId: 'el_1784576296171_s9t3' },
]

/** NBP template element id → Triton canonical key (for the NBP import). */
export const NBP_ELEMENT_TO_KEY: Record<string, string> = Object.fromEntries(
  MOVEMENT_SCREEN_FIELDS.map((f) => [f.nbpElementId, f.key])
)

export type MovementScreen = {
  id: string
  athlete_profile_id: string
  assessed_at: string
  responses: Record<string, string>
  notes: string | null
  source: 'triton' | 'nbp'
  nbp_submission_id: string | null
  created_at: string
}
