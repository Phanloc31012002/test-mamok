# Adapter bộ tính KTS v0.6.0 — bản cục bộ

Adapter đang tích hợp bàn giao bộ tính live **v0.6.0/64 mốc công khai**. Bộ kiểm thử mới dùng schema và **26 fixture I/O quote công khai v0.6.0**, phủ đủ 15 nhãn giấy được phép; fixture chỉ kiểm tra giao thức và việc giữ nguyên kết quả server. Version v0.6.0 lấy từ bàn giao của chủ cơ sở; quote response không có trường semver để tự xác định phiên bản. Corpus v0.5.0/130 được lưu thành checkpoint, không còn là bộ active; candidate v0.5.1/164 vẫn lưu riêng như lịch sử chờ, không thuộc package active hoặc runtime client. Bản adapter chỉ ở cục bộ, chưa commit/publish; QA cuối và trạng thái chờ quyền được ghi bên dưới.

Bản cục bộ giữ cấu trúc release `f479`: bỏ toàn bộ nút i/panel thông tin, không có thông báo hay link thay thế, đồng thời thêm hai backlink decal giấy/tag bông tai để đủ 12 mapping. Mặc định hiểu sâu, các cơ chế gửi/kiểm soát AI và nhãn Tư vấn qua Zalo giữ nguyên. Việc giữ release này tách khỏi nghiệm thu adapter KTS v0.6.0.

## Luồng

`widget/kts-session.js` giữ các lựa chọn công khai trong RAM của phiên mở trang. `widget/kts-client.js` gửi chúng tới `/api/mam-quote`. Route `api/mam-quote.js` dùng `server/kts-quote.mjs` để gọi endpoint cố định `https://invinhphat.com/wp-json/vp-quickquote/v1/quote`.

Chỉ gửi đúng tám trường: `paper`, `quantity`, `length`, `width`, `sides`, `laminate`, `roundCorners`, `micaBox`. Không gửi tên sản phẩm, câu chat, lịch sử, người liên hệ, file, bảng giá hoặc thông tin cấu hình Excel. Không cần key, cookie hay nonce. Proxy không lưu hoặc ghi log quote.

Card in nhanh mặc định 9 × 5,4 cm; một hộp là 100 cái. Parser đổi hộp sang cái một lần và giữ nguyên đơn vị ban đầu trong phiên để tránh đổi lại khi khách sửa lựa chọn. Tag/voucher phải có kích thước và đơn vị rõ và chỉ cho chọn C300 theo yêu cầu của chủ cơ sở. Danh mục nhiều loại giấy chỉ dành cho card; chuyển sản phẩm không giữ giấy không tương thích.

Danh mục được phép dùng trong **adapter Mầm có 15 mã: p05–p18 và p20**. p11 là K02 146gsm; p18 có nhãn công khai mới **Boheme Tradition Neve 320gsm**. p22 chỉ còn là alias API cũ của Neve; lựa chọn công khai dùng p18, không coi p22 là một loại giấy riêng. B350 p09 giữ nguyên. Phiên chọn giấy nhận ID/label công khai; không chứa giá, hệ số hoặc công thức.

**p19 Old Mill Biancon bị loại khỏi Mầm** vì baseline chủ cơ sở chưa được xác nhận, dù API công khai có thể trả giá. Không tự thay bằng Avorio p12 hoặc Premium White p14. B300 và Kraft chưa có mapping được duyệt nên cần làm rõ/tư vấn; không đổi B300 thành B350 hoặc chọn giấy gần giống. Các giấy được phép dùng vẫn gửi đúng kích thước/số mặt/số lượng khách chọn để backend xác nhận hoặc trả 422. Không đổi card custom thành 9 × 5,4 cm hoặc tự quyết định bậc giá.

Điều kiện UI công khai đã được kiểm tra lại trên trang live ngày 14/10/2026 và áp dụng trên danh mục Mầm: năm giấy chuẩn p05–p09 cho chọn cán màng; mười giấy mỹ thuật p10–p18 và p20 tự chọn Không. Diện tích lớn hơn 48,6 cm² tự chọn không hộp mica; hết điều kiện khóa thì có thể chọn lại, không tự chuyển thành Có. Đây là điều kiện giao diện, không chứa phép tính giá. [JS thực tế trang live nạp vẫn mang tên v040](https://invinhphat.com/wp-content/plugins/vp-quickquote/assets/calculator-v040.js).

Widget chọn luồng KTS trước khi gọi phiên bảng giá cũ. In offset dùng riêng dữ liệu và đơn vị hộp cũ; khi chuyển từ KTS, khách chọn lại gói offset hoặc nhờ xác nhận quy cách, không tự bỏ giấy/kích thước/gia công đang chọn để báo giá gói. Số cái KTS không trở thành số hộp offset. Bế hình và yêu cầu ngoài card/tag chữ nhật/voucher chuyển tư vấn. Xem bảng giá vẫn mở bảng đã có.

## Kết quả và lỗi

API trả `total` dạng chuỗi số nguyên VND. Adapter chỉ định dạng để hiển thị, không tính lại, nội suy, cộng VAT, điều chỉnh lợi nhuận hoặc lấy giá trong bảng để thay kết quả. Client kiểm tra đủ tám trường của `spec` khớp yêu cầu trước khi hiển thị.

Mầm chỉ gửi `roundCorners`, `micaBox` và các lựa chọn; API v0.6.0 quyết định `total`. Adapter không nhúng công thức, tự cộng phí bo góc hoặc điều chỉnh theo phần trăm. Giá trị quote kiểm thử chỉ dùng để đối chiếu I/O, không làm bảng tính thay cho API.

Các lượt qua proxy dùng IP máy chủ. Khi bộ tính trả 429, widget báo bận và chờ khách chủ động thử lại, không tự retry. Lượt kiểm tra này không xác nhận hạn mức theo phút của API v0.6.0.

GET metadata không có chat. Đóng/làm mới hủy POST hoặc lượt đang chờ; metadata có thể hoàn tất để dùng cho lượt tiếp theo. Hủy widget hủy cả metadata. Generation guard loại bỏ phản hồi cũ khi khách sửa lựa chọn. API lỗi, timeout, giới hạn lượt hoặc phản hồi sai quy cách giữ lựa chọn và cho thử lại/tư vấn; không lấy giá từ Gemini hoặc bảng offset thay thế.

Standalone không mount endpoint KTS và không tính giá thay cho bộ tính. Build không đưa server, workbook, công thức, hệ số hay cấu hình tính giá vào `public/`. Schema/26 fixture active v0.6.0 chỉ ở vùng kiểm thử; checkpoint v0.5.0 và candidate v0.5.1 lưu riêng ngoài package active. Không chép các bộ này vào `public/`, standalone hoặc runtime client. WordPress assets vẫn chỉ được sao chép khi dùng cờ build riêng.

## Kiểm chứng và điều kiện phát hành

Tests mock kiểm tra thông số, đơn vị, trạng thái phiên, bảo vệ request/response, kết quả chuỗi lớn và hủy bất đồng bộ. Các tổng tùy ý dùng cho tests giao thức không phải mức giá nghiệp vụ. Fixture công khai chỉ kiểm tra proxy/client giữ nguyên kết quả được bàn giao, không dùng để Mầm tự tính giá hoặc thay nghiệm thu engine live.

**Bằng chứng API v0.6.0 ngày 14/10/2026:** kiểm tra trực tiếp gồm GET trang công khai và tổng cộng **30 probe API vô danh**: 26 quote của giấy được phép, một quan sát alias p22, một quan sát p19 chưa được Mầm chấp nhận và hai chuỗi không hợp lệ. **13 kiểm tra mốc được cung cấp đều khớp**, với quy cách đầy đủ ghi trong fixture/capture. Capture 16 quote ban đầu nằm tại `evidence/v060-live-public-quotes.json`; gói bằng chứng còn có audit nguồn của bộ fixture v0.6.0. Các mốc chính gồm:

| Nhóm đối chiếu | Số lượng trong capture | Tổng VND đã đọc |
| --- | --- | --- |
| C300 | 500 / 1.000 | 400.000 / 700.000 |
| B350 | 100 / 500 / 1.000 | 140.000 / 650.000 / 1.200.000 |
| Voucher, không bo/mica | 20 / 50 / 100 / 200 | 90.000 / 150.000 / 230.000 / 470.000 |

Hai case dưới 100 sản phẩm bật bo góc và mica vẫn trả các tổng 90.000/150.000 VND theo capture. Đối chiếu bổ sung voucher 20/50 với `micaBox:false` cũng khớp 90.000/150.000 VND. Bằng chứng này thuộc API live và các request cụ thể; QA toàn bộ proxy/client/UI của adapter được ghi riêng bên dưới.

**Lịch sử adapter v0.5.0:** bản cục bộ `mam-kts-integration` đạt 1.369/1.369 kiểm thử Node, gồm **130 fixture** transport công khai và 3 kiểm tra corpus/schema. Browser mock đạt 54/54 ở 1280 × 720 và 54/54 ở 320 × 568; screenshot hai viewport đã được kiểm tra. Build thành công, fixture/schema không có trong `public/` hoặc standalone. Dữ liệu bảng giá, policy cũ, Gemini và WordPress không đổi trong lượt đó. Adapter không gọi bộ tính thật; nghiệm thu 37 API live thuộc tác vụ bộ tính được bàn giao. Corpus này hiện là checkpoint lịch sử, không active; các số không chứng nhận adapter v0.6.0.

**Lịch sử candidate v0.5.1 đang chờ:** schema và 164 fixture công khai đã nhận qua Library ở lượt trước nhưng chưa chấp nhận làm contract/giá cuối sau đính chính. Bộ này vẫn giữ riêng trong bằng chứng chờ, không active, không dùng để nghiệm thu v0.6.0 hoặc đóng gói/phát hành.

**Lịch sử QA cấu trúc ngày 14/10/2026:** dùng corpus transport v0.5.0/130 fixture và code đã ghép release `f479`; Node đạt **1.382/1.382**, browser KTS mock đạt **61/61** ở 1280 × 720 và **61/61** ở 320 × 568; build và kiểm tra ranh giới artifact đạt. Đã sửa phủ định không cần/không muốn bo góc; giữ nguyên số lượng và gia công khác. Không gọi API bộ tính hoặc Gemini thật trong lượt đó. Các kết quả này không chứng nhận adapter v0.6.0.

**Corpus v0.6.0 hiện tại:** `tests/fixtures/kts-v060-schema.json` và `tests/fixtures/kts-v060-fixtures.json` chứa schema cùng 26 quote công khai của đủ 15 nhãn giấy. Kiểm thử riêng `tests/kts-v060-fixtures.test.mjs` đạt **29/29** gồm 26 case và ba guard corpus/schema. Ba file corpus v0.5.0 cũ được giữ nguyên tại `evidence/pre-v060` và đã gỡ khỏi active/imports.

**QA cuối adapter v0.6.0 ngày 14/10/2026:** source parser đã freeze và khớp hash sau kiểm tra; toàn bộ Node đạt **1.290/1.290**, gồm corpus **29/29**. Browser KTS mock đạt **66/66** ở 1280 × 720 và **66/66** ở 320 × 568; ảnh hai viewport đã được xem. Build, diff check và ranh giới artifact đều đạt. Câu hỏi thiếu quy cách giữ một thông tin mỗi lượt; ba chấm hiện trước phản hồi đủ 320 ms, tổng tiền vẫn hai dòng logic và lấy nguyên từ API. UI/backlink release `f479` giữ nguyên. Adapter sẵn sàng local chờ quyền commit/publish; chưa phát hành.

Trước commit/publish phải hoàn tất QA mapping/schema/proxy/client/UI, kiểm tra ranh giới artifact, báo diff local và chờ quyền phát hành. Không sửa engine, Excel/công thức hoặc WordPress. Schema/26 fixture active v0.6.0 chỉ nằm trong `tests/fixtures/`; checkpoint v0.5.0 và candidate v0.5.1 lưu riêng ngoài package active. Không chép schema/fixture vào `public/` hoặc standalone/client; bộ tính vẫn là nguồn của mọi tổng tiền KTS. Bản adapter cục bộ chưa commit/publish.
