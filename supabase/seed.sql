INSERT INTO scoring_categories(id,name,name_s,name_e,name_es,kind,show_index) VALUES
 ('10000000-0000-4000-8000-000000000001','リーグ戦','リーグ','League','LG','league',1),
 ('10000000-0000-4000-8000-000000000002','大会・練習','大会','Tournament','TR','tournament',2);
INSERT INTO opponent_teams(id,name,name_s,name_e,name_es,category_id,mark,is_own_team,display_order) VALUES
 ('20000000-0000-4000-8000-000000000001','滋賀大学(テスト)','滋賀大T','Shiga Univ Test','SUT','10000000-0000-4000-8000-000000000001','滋',true,1),
 ('20000000-0000-4000-8000-000000000002','対戦校(テスト)','対戦校T','Opponent Test','OPT','10000000-0000-4000-8000-000000000002','対',false,2);
INSERT INTO scoring_stadiums(id,name,name_s,name_e,name_es,home_team_id,show_index) VALUES
 ('30000000-0000-4000-8000-000000000001','テスト球場','テスト','Test Stadium','TS','20000000-0000-4000-8000-000000000001',1);
UPDATE opponent_teams SET stadium_id='30000000-0000-4000-8000-000000000001';
INSERT INTO scoring_positions(id,name,name_s,group_kind,show_index) VALUES
 (1,'投手','投','field',1),(2,'捕手','捕','field',2),(3,'一塁手','一','field',3),(4,'二塁手','二','field',4),
 (5,'三塁手','三','field',5),(6,'遊撃手','遊','field',6),(7,'左翼手','左','field',7),(8,'中堅手','中','field',8),
 (9,'右翼手','右','field',9),(10,'DH','DH','field',10),(11,'先発','先','role',11),(12,'中継ぎ抑え','中継','role',12),
 (13,'控え捕手','控捕','role',13),(14,'内野手','内','role',14),(15,'外野手','外','role',15),(16,'その他','他','role',16);
INSERT INTO scoring_weather(id,name,show_index) VALUES
 (1,'晴れ',1),(2,'晴れ時々くもり',2),(3,'晴れのちくもり',3),(4,'くもり',4),(5,'くもり時々晴れ',5),(6,'くもりのち晴れ',6),
 (7,'くもり時々雨',7),(8,'くもりのち雨',8),(9,'晴れ時々雨',9),(10,'晴れのち雨',10),(11,'雨時々晴れ',11),(12,'雨のち晴れ',12),
 (13,'雨時々くもり',13),(14,'雨のちくもり',14),(15,'雨',15),(16,'嵐',16),(17,'雪',17),(18,'変な天気',18);
INSERT INTO scoring_pickoff_details(id,base,name,order_by) VALUES
 (1,1,'ターン',1),(2,1,'速ターン',2),(3,1,'はずして',3),(4,1,'サイン交換中',4),(5,1,'入り際',5),(6,1,'出戻り',6),(7,1,'ピックオフ',7),
 (8,2,'フェイント',1),(9,2,'フラッシュ',2),(10,2,'Cサイン',3),(11,2,'一発',4),(12,2,'逆ターン',5),(13,2,'時間差',6),(14,2,'サインミス',7),
 (15,3,'サイン交換中',1),(16,3,'入り際',2),(17,3,'足上げ',3),(18,3,'足出し',4),(19,3,'はずして',5);
INSERT INTO scoring_memos(id,name,division,show_index) VALUES
 (1,'サヨナラ',1,1),(2,'12回引分け',1,2),(3,'引分け',1,3),(4,'降雨中断',1,4),(5,'降雨コールド',1,5),(6,'ノーゲーム',1,6),
 (7,'中断中',1,7),(8,'15回引分け',1,8),(9,'放棄試合',1,9),(10,'乱闘',1,10),(11,'抗議中',1,11),(12,'サスペンデットゲーム',1,12),
 (13,'ピッチクロック（打者側）',1,13),(14,'ピッチクロック（投手側）',1,14),(15,'反則打球',1,15);
INSERT INTO scoring_results(id,name,name_s,division,last_id,stats_id,strike_flag,ball_flag,out_flag,runs,last_ball,tag_up,bunt,bat_must_chk,batting_flag,pitcher_flag,display_flag,ground_allowed,fly_allowed,liner_allowed,list_id,list_x,list_y,button_color,ball_color,summary_code,old_excel_label,show_index) VALUES
 (0,'なし','なし',1,12,0,false,false,false,0,false,false,false,false,false,false,false,false,false,false,0,0,0,'black','black','0','0',0),
 (1,'ファウル','ファウル',1,4,5,true,false,false,0,false,false,false,true,true,true,true,true,true,true,1,1,4,'silver','yellow','FO','ファウル',1),
 (2,'単打','単打',1,1,1,false,false,false,1,true,false,false,true,true,true,true,true,true,true,5,2,1,'navy','navy','1','単打',2),
 (3,'死球','死球',1,10,0,false,false,false,1,true,false,false,false,false,true,true,false,false,false,5,5,1,'olive','aqua','HBP','死球',3),
 (4,'二塁打','二塁打',1,1,1,false,false,false,2,true,false,false,true,true,true,true,true,true,true,5,2,2,'navy','navy','2','二塁打',4),
 (5,'エンタイトル２ベース','ｴﾝﾀｲﾄﾙ2B',1,1,1,false,false,false,2,true,false,false,true,true,true,true,true,true,true,5,2,3,'navy','navy','2B','エンタイトル２ベース',5),
 (6,'三塁打','三塁打',1,1,1,false,false,false,3,true,false,false,true,true,true,true,true,true,true,5,3,1,'navy','navy','3','三塁打',6),
 (7,'本塁打','本塁打',1,1,1,false,false,false,4,true,false,false,true,true,true,true,true,true,true,5,3,2,'navy','navy','HR','本塁打',7),
 (8,'失策出塁','失策出塁',1,5,2,false,false,false,1,true,false,false,true,true,true,true,true,true,true,5,1,3,'black','black','E','失策出塁',8),
 (9,'凡打','凡打',1,2,2,false,false,false,0,true,false,false,true,true,true,true,true,true,true,5,1,1,'black','black','OUT','凡打',9),
 (10,'犠打','犠打',1,6,6,false,false,false,0,true,false,true,true,true,true,true,true,true,false,5,4,1,'lime','green','SAC','犠打',10),
 (11,'犠飛','犠飛',1,7,6,false,false,false,0,true,true,false,true,true,true,true,false,true,true,5,4,2,'lime','green','SF','犠飛',11),
 (12,'空振','空振',1,3,3,true,false,false,0,false,false,false,false,true,true,true,false,false,false,1,1,1,'gray','lime','K','空振',12),
 (13,'見送','見送',1,3,4,true,false,false,0,false,false,false,false,false,true,true,false,false,false,1,1,2,'gray','olive','KL','見送',13),
 (14,'ボール','ボール',4,9,0,false,true,false,0,false,false,false,false,false,true,true,false,false,false,1,1,3,'purple','aqua','B','ボール',14),
 (15,'四球','四球',1,9,0,false,true,false,1,true,false,false,false,false,true,false,false,false,false,0,0,0,'black','aqua','BB','四球',15),
 (16,'邪飛','邪飛',1,4,2,false,false,true,0,true,false,false,true,true,true,true,false,true,true,5,1,2,'black','black','FOUL_OUT','邪飛',16),
 (17,'牽制','牽制',4,12,0,false,false,false,0,false,false,false,false,false,false,false,false,false,false,0,0,0,'black','black','PICKOFF','牽制',17),
 (18,'盗塁','盗塁',3,12,0,false,false,false,0,false,false,false,false,false,false,false,false,false,false,0,0,0,'black','black','STEAL','盗塁',18),
 (19,'交代','交代',11,12,0,false,false,false,0,false,false,false,false,false,false,false,false,false,false,0,0,0,'black','black','SUB','交代',19),
 (20,'ボーク','ボーク',4,5,0,false,false,false,1,false,false,false,false,false,false,true,false,false,false,2,1,1,'white','black','BK','ボーク',20),
 (21,'打撃妨害','打撃妨害',5,11,7,false,false,false,1,true,false,false,false,true,true,true,false,false,false,5,6,1,'black','silver','INTERFERENCE','打撃妨害',21),
 (22,'守備妨害','守備妨害',3,5,7,false,false,true,0,true,false,false,false,true,true,true,false,false,false,5,6,2,'black','silver','OBSTRUCTION','守備妨害',22),
 (23,'走塁妨害','走塁妨害',6,5,7,false,false,false,1,true,false,false,false,true,true,true,false,false,false,5,5,3,'black','silver','OBSTRUCTION','走塁妨害',23),
 (24,'振り逃げ','振り逃げ',1,3,3,false,false,false,1,false,false,false,false,true,true,true,false,false,false,5,5,2,'olive','lime','K_DROPPED','振り逃げ',24),
 (25,'タイム','タイム',11,12,0,false,false,false,0,false,false,false,false,false,false,true,false,false,false,9,1,1,'black','black','TIME','タイム',25),
 (26,'アピールプレー','アピール',11,12,0,false,false,false,0,false,false,false,false,false,false,true,false,false,false,9,1,2,'black','black','APPEAL','アピールプレー',26),
 (27,'走塁','走塁',3,12,0,false,false,false,0,false,false,false,false,false,false,false,false,false,false,0,0,0,'black','black','RUN','走塁',27),
 (28,'反則投球','反則投球',4,5,0,false,false,false,0,false,false,false,false,false,false,true,false,false,false,2,1,2,'white','aqua','ILLEGAL_PITCH','反則投球',28),
 (29,'15秒ルール','15秒ルール',4,5,0,false,false,false,0,false,false,false,false,false,false,true,false,false,false,2,1,3,'white','black','CLOCK','15秒ルール',29),
 (30,'野手選択','野選',1,2,2,false,false,false,1,true,false,false,true,true,true,true,true,true,true,5,6,3,'black','black','FC','野手選択',30),
 (31,'空振三振','空三振',1,3,3,true,false,false,0,true,false,false,false,true,true,false,false,false,false,0,0,0,'black','lime','K','空振三振',31),
 (32,'見送三振','見三振',1,3,4,true,false,false,0,true,false,false,false,false,true,false,false,false,false,0,0,0,'black','olive','KL','見送三振',32),
 (33,'先発','先発',11,12,0,false,false,false,0,false,false,false,false,false,false,false,false,false,false,0,0,0,'black','black','STARTER','先発',33),
 (34,'犠打失策','犠打失策',1,6,6,false,false,false,1,true,false,true,true,true,true,true,true,true,false,5,4,3,'lime','green','SAC_E','犠打失策',34),
 (35,'犠飛失策','犠飛失策',1,7,6,false,false,false,1,true,true,false,true,true,true,true,false,true,true,5,4,4,'lime','green','SF_E','犠飛失策',35),
 (36,'犠打野選','犠打野選',1,6,6,false,false,false,1,true,false,true,true,true,true,true,true,true,false,5,5,4,'lime','green','SAC_FC','犠打野選',36),
 (37,'野選失策','野選失策',1,2,2,false,false,false,1,true,false,false,true,true,true,true,true,true,true,5,6,4,'black','black','FC_E','野選失策',37),
 (38,'スリーバント失敗','ｽﾘｰﾊﾞﾝﾄ失敗',1,3,5,true,false,false,0,true,false,true,true,true,true,true,false,false,false,5,1,4,'black','yellow','K_BUNT','スリーバント失敗',38);
INSERT INTO scoring_plans(id,name,division,show_index,bunt_flag,and_run_flag,steal_flag,sb_flag,cs_flag,display_flag,old_excel_label) VALUES
 (1,'送りバント',8,1,true,false,false,false,false,true,'1バント'),(2,'スクイズ',8,1,true,false,false,false,false,true,'1バント'),(3,'セフティバント',8,1,true,false,false,false,false,true,'3セフティ'),(4,'バスター',8,1,true,false,false,false,false,true,'2バスター'),(5,'ドラッグバント',8,1,true,false,false,false,false,true,'1バント'),(6,'プッシュバント',8,1,true,false,false,false,false,true,'1バント'),(7,'スクイズ（打者走者）',8,1,true,false,false,false,false,true,'6スクイズ'),(8,'セフティスクイズ',8,1,true,false,false,false,false,true,'6スクイズ'),
 (9,'盗塁企画',3,2,false,false,true,false,false,true,'5盗塁'),(10,'盗塁成功',3,2,false,false,true,true,false,true,'5盗塁'),(11,'盗塁失敗',3,2,false,false,true,false,true,true,'5盗塁'),(12,'ダブルスチール',3,2,false,false,true,false,false,true,'5盗塁'),(13,'ディレードスチール',3,2,false,false,true,false,false,true,'5盗塁'),
 (14,'エンドラン（HAR）',4,3,false,true,false,false,false,true,'4エンドラン系'),(15,'ランエンドヒット（RAH）',4,3,false,true,false,false,false,true,'4エンドラン系'),(16,'バスターエンドラン（BSAR）',4,3,false,true,false,false,false,true,'4エンドラン系'),(17,'バントエンドラン（BAR）',4,3,true,true,false,false,false,true,'4エンドラン系'),
 (18,'バント構え',8,0,true,false,false,false,false,false,'0'),(19,'セーフティーファール（1塁側）',8,0,true,false,false,false,false,false,'0'),(20,'セーフティーファール（3塁側）',8,0,true,false,false,false,false,false,'0'),(21,'セーフティーバント（1塁側）',8,0,true,false,false,false,false,false,'0'),(22,'セーフティーバント（3塁側）',8,0,true,false,false,false,false,false,'0'),(23,'セーフティーバント（投手方向）',8,0,true,false,false,false,false,false,'0'),(24,'待球',2,0,false,false,false,false,false,false,'0'),(25,'スリーバント失敗・構え',8,0,true,false,false,false,false,false,'0'),(26,'セーフティーバント構え',8,0,true,false,false,false,false,false,'0'),(27,'セーフティースクイズ',8,0,true,false,false,false,false,false,'0'),(28,'1塁側バント',8,0,true,false,false,false,false,false,'0'),(29,'3塁側バント',8,0,true,false,false,false,false,false,'0'),(30,'バントファウル',8,0,true,false,false,false,false,false,'0'),(31,'バント空振り',8,0,true,false,false,false,false,false,'0'),(32,'バント失敗',8,0,true,false,false,false,false,false,'0'),(33,'スクイズ失敗',8,0,true,false,false,false,false,false,'0'),(34,'スクイズ構え',8,0,true,false,false,false,false,false,'0'),(35,'スクイズファウル',8,0,true,false,false,false,false,false,'0'),(36,'偽装スクイズ',8,0,true,false,false,false,false,false,'0'),(37,'ヒットエンドラン',4,0,false,true,false,false,false,false,'0'),(38,'ギャンブルGO',3,0,false,false,true,false,false,false,'0'),(39,'単独スチール',3,0,false,false,true,false,false,false,'0'),(40,'1,3挟殺プレー（トリック）',3,0,false,false,true,false,false,false,'0'),(41,'ダブルスティール（記録）',3,0,false,false,true,false,false,false,'0'),(42,'ディレイドスティール（記録）',3,0,false,false,true,false,false,false,'0'),(43,'ギャンブルスティール',3,0,false,false,true,false,false,false,'0'),
 (44,'バント企図',8,0,true,false,false,false,false,false,'0'),(45,'バント成功',8,0,true,false,false,false,false,false,'0'),(46,'バント失敗（記録）',8,0,true,false,false,false,false,false,'0'),(47,'スクイズ企図',8,0,true,false,false,false,false,false,'0'),(48,'セーフティ企図',8,0,true,false,false,false,false,false,'0'),(49,'エンドラン企図',4,0,false,true,false,false,false,false,'0'),(50,'走者スタート',3,0,false,false,true,false,false,false,'0'),(51,'盗塁刺',3,0,false,false,true,false,true,false,'0'),(52,'牽制戻り',3,0,false,false,false,false,false,false,'0'),(53,'その他作戦',11,0,false,false,false,false,false,false,'0');
INSERT INTO scoring_ball_types(id,name,name_s,symbol,family_id,stats_kind,right_glyph,right_color,left_glyph,left_color,display_flag,show_index,old_excel_label) VALUES
 (1,'ツーシーム','TS','TS',1,10,'BALL001','red','BALL002','red',true,1,'ツーシーム'),(2,'特殊球','特殊','OT',0,9,'BALL000','gray','BALL000','gray',true,2,'特殊球'),(3,'ストレート','FB','FB',1,1,'BALL000','red','BALL000','red',true,3,'ストレート'),(4,'スライダー','SL','SL',2,4,'BALL003','blue','BALL004','blue',true,4,'スライダー'),(5,'スイーパー','SW','SW',2,4,'BALL003','blue','BALL004','blue',true,5,'スライダー'),(6,'カット','CT','CT',2,3,'BALL005','cyan','BALL006','cyan',true,6,'カット'),(7,'カーブ','CB','CB',3,5,'BALL007','green','BALL007','green',true,7,'カーブ'),(8,'スプリット','SP','SP',3,6,'BALL008','purple','BALL008','purple',true,8,'フォーク'),(9,'チェンジアップ','CH','CH',3,8,'BALL009','orange','BALL009','orange',true,9,'チェンジ'),(10,'シンカー','SI','SI',2,7,'BALL010','blue','BALL010','blue',true,10,'シンカー'),(11,'ナックル','KN','KN',0,11,'BALL011','gray','BALL011','gray',true,11,'特殊球'),(12,'ナックルカーブ','KC','KC',3,5,'BALL012','green','BALL012','green',true,12,'カーブ'),(13,'その他','OT','OT',0,9,'BALL000','gray','BALL000','gray',true,13,'特殊球');
INSERT INTO scoring_roster_players(team_id,name,name_s,name_e,name_es,throw_hand,bat_hand,primary_position_id,show_index)
SELECT t.id,'選手A'||lpad(n::text,2,'0'),'A'||lpad(n::text,2,'0'),'Player A'||lpad(n::text,2,'0'),'PA'||lpad(n::text,2,'0'),'R',CASE WHEN n%3=0 THEN 'L' ELSE 'R' END,CASE WHEN n=1 THEN 1 WHEN n=2 THEN 2 WHEN n=3 THEN 3 WHEN n=4 THEN 4 WHEN n=5 THEN 5 WHEN n=6 THEN 6 WHEN n=7 THEN 7 WHEN n=8 THEN 8 WHEN n=9 THEN 9 ELSE 10 END,n
FROM opponent_teams t CROSS JOIN generate_series(1,12) n;
INSERT INTO scoring_player_careers(roster_player_id,team_id,start_date,uniform_no)
SELECT id,team_id,'2026-01-01'::date,lpad(show_index::text,2,'0') FROM scoring_roster_players;
