-- up

ALTER TABLE categories ADD COLUMN description TEXT NOT NULL DEFAULT '';

-- 回填默认分类的 AI 描述（仅更新 is_system=1 的系统分类）

-- 消费分类
UPDATE categories SET description = '房租、房贷月供' WHERE name = '住房' AND is_system = 1;
UPDATE categories SET description = '外卖、堂食、食堂、餐厅' WHERE name = '正餐' AND is_system = 1;
UPDATE categories SET description = '地铁、公交、打车、加油、停车费' WHERE name = '交通' AND is_system = 1;
UPDATE categories SET description = '超市购物、日用品、清洁用品' WHERE name = '百货' AND is_system = 1;
UPDATE categories SET description = '软件订阅、工具App、会员服务' WHERE name = '效率' AND is_system = 1;
UPDATE categories SET description = '游戏、电影、演出、KTV' WHERE name = '娱乐' AND is_system = 1;

-- 收入分类
UPDATE categories SET description = '固定薪资收入' WHERE name = '工资' AND is_system = 1;
UPDATE categories SET description = '年终奖、绩效奖金等' WHERE name = '奖金' AND is_system = 1;
UPDATE categories SET description = '投资收益、利息等' WHERE name = '理财' AND type = 'income' AND is_system = 1;
UPDATE categories SET description = '收到的红包、礼金' WHERE name = '红包' AND is_system = 1;
UPDATE categories SET description = '兼职、稿费等' WHERE name = '副业' AND is_system = 1;
UPDATE categories SET description = '费用报销' WHERE name = '报销' AND is_system = 1;

-- 投资分类
UPDATE categories SET description = '基金定投、申购等' WHERE name = '基金' AND is_system = 1;
UPDATE categories SET description = '股票买入' WHERE name = '股票' AND is_system = 1;
UPDATE categories SET description = '银行理财、存款等' WHERE name = '理财产品' AND is_system = 1;
UPDATE categories SET description = '投资型保险' WHERE name = '保险投资' AND is_system = 1;
UPDATE categories SET description = '房产投资相关支出' WHERE name = '房产' AND is_system = 1;

-- down
UPDATE categories SET description = '';
