-- up
INSERT OR IGNORE INTO categories (name, type, sort_order, is_system) VALUES
  ('住房',     'expense', 1,  1),
  ('保险',     'expense', 2,  1),
  ('水电燃气', 'expense', 3,  1),
  ('正餐',     'expense', 4,  1),
  ('食材',     'expense', 5,  1),
  ('零食',     'expense', 6,  1),
  ('交通',     'expense', 7,  1),
  ('百货',     'expense', 8,  1),
  ('娱乐',     'expense', 9,  1),
  ('电子数码', 'expense', 10, 1),
  ('鞋服',     'expense', 11, 1),
  ('通讯',     'expense', 12, 1),
  ('效率',     'expense', 13, 1),
  ('物业',     'expense', 14, 1),
  ('教育',     'expense', 15, 1),
  ('社交',     'expense', 16, 1),
  ('宠物',     'expense', 17, 1),
  ('医疗',     'expense', 18, 1),
  ('家具',     'expense', 19, 1),
  ('电器',     'expense', 20, 1),
  ('工作',     'expense', 21, 1),
  ('其他',     'expense', 22, 1),
  ('工资',     'income',  1,  1),
  ('奖金',     'income',  2,  1),
  ('理财',     'income',  3,  1),
  ('红包',     'income',  4,  1),
  ('副业',     'income',  5,  1),
  ('报销',     'income',  6,  1),
  ('其他',     'income',  7,  1);

-- down
DELETE FROM categories WHERE is_system = 1;
