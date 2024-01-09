import express from "express";
import cookieParser from "cookie-parser";
import mysql from "mysql2";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";

const app = express();

app.use(express.json());
app.use(cookieParser());

const db = mysql.createConnection({
  host: '127.0.0.1', 
  user: 'root',      
  password: 'shivansi789', 
  database: 'project',
});

db.connect((err) => {
  if (err) {
    console.error('Error connecting to MySQL:', err);
  } else {
    console.log('Connected to MySQL');
  }
});

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "../client/public/upload");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + file.originalname);
  },
});

const upload = multer({ storage });

app.post("/server/upload", 
upload.single("file"), function (req, res) {
  const file = req.file;
  res.status(200).json(file.filename);
});



app.post("/server/auth/register", (req, res) => {
        //CHECK EXISTING USER
        const q = "SELECT * FROM users WHERE email = ? OR username = ?";
      
        db.query(q, [req.body.email, req.body.username], (err, data) => {
                // stringify the data object
                if (err) return JSON.stringify(res.status(500).json(err));
                if (data.length) return res.status(409).json({message:"User already exists!"});
      
          //Hash the password and create a user
          const salt = bcrypt.genSaltSync(10);
          const hash = bcrypt.hashSync(req.body.password, salt);
      
          const q = "INSERT INTO users(`username`,`email`,`password`) VALUES (?)";
          const values = [req.body.username, req.body.email, hash];
      
          db.query(q, [values], (err, data) => {
            if (err) return res.status(500).json(err);
            return res.status(200).json("User has been created.");
          });
        });
});

app.post("/server/auth/login", (req, res) => {
  //CHECK USER

  const q = "SELECT * FROM users WHERE username = ?";

  db.query(q, [req.body.username], (err, data) => {
    if (err) return res.status(500).json(err);
    if (data.length === 0) return res.status(404).json("User not found!");

    //Check password
    const isPasswordCorrect = bcrypt.compareSync(
      req.body.password,
      data[0].password
    );

    if (!isPasswordCorrect)
      return res.status(400).json("Wrong username or password!");

    const token = jwt.sign({ id: data[0].id }, "jwtkey");
    const { password, ...other } = data[0];

    res
      .cookie("access_token", token, {
        httpOnly: true,
      })
      .status(200)
      .json(other);
  });
});

app.post("/server/auth/logout", (req, res) => {
        res.clearCookie("access_token",{
                sameSite:"none",
                secure:true
              }).status(200).json("User has been logged out.")
});
      
app.get("/server/posts", (req, res) => {
        const q = req.query.cat
        ? "SELECT * FROM posts WHERE cat=?"
        : "SELECT * FROM posts";
    
      db.query(q, [req.query.cat], (err, data) => {
        if (err) return res.status(500).send(err);
    
        return res.status(200).json(data);
      });
    });
              
app.get("/server/posts/:id", (req, res) => {
        const q =
          "SELECT p.id, `username`, `title`, `desc`, p.img, u.img AS userImg, `category_id`, `cat`,`date` FROM users u JOIN posts p ON u.id = p.uid WHERE p.id = ? ";
      
        db.query(q, [req.params.id], (err, data) => {
          if (err) return res.status(500).json(err);
      
          return res.status(200).json(data[0]);
        });
      });

// Backend: Fetch post and its replies including nested replies
app.get("/server/posts/:id/replies", (req, res) => {
  const postId = req.params.id;

  const q = `
    SELECT * FROM posts WHERE parent_id = ?
    UNION
    SELECT * FROM posts WHERE id = ?
  `;

  db.query(q, [postId, postId], (err, replies) => {
    if (err) {
      console.error('Error fetching replies:', err);
      return res.status(500).json(err);
    }
    
    // The result needs to be processed into a nested structure if not already
    const nestedReplies = processReplies(replies);
    console.log(nestedReplies);
    res.status(200).json(nestedReplies);
  });
});

// A recursive function to process replies into a nested structure
function processReplies(replies, parentId = null) {
  return replies
    .filter(reply => reply.parent_id === parentId)
    .map(reply => ({
      ...reply,
      replies: processReplies(replies, reply.id)
    }));

}


// app.post("/server/posts", (req, res) => {
//         const token = req.cookies.access_token;
//         if (!token) return res.status(401).json("Not authenticated!");
      
//         jwt.verify(token, "jwtkey", (err, userInfo) => {
//           if (err) return res.status(403).json("Token is not valid!");
      
//           const q =
//             "INSERT INTO posts(`title`, `desc`, `img`, `cat`, `date`,`uid`, `category_id`,`parent_id`) VALUES (?)";
      
//           const values = [
//             req.body.title,
//             req.body.desc,
//             req.body.img,
//             req.body.cat,
//             req.body.date,
//             userInfo.id,
//             req.body.category_id,
//             parent_id || null
//           ];
      
//           db.query(q, [values], (err, data) => {
//             if (err) return res.status(500).json(err);
//             return res.json("Post has been created.");
//           });
//         });
//       });
      

app.post("/server/posts", (req, res) => {
  const token = req.cookies.access_token;
  if (!token) return res.status(401).json("Not authenticated!");

  jwt.verify(token, "jwtkey", (err, userInfo) => {
    if (err) return res.status(403).json("Token is not valid!");

    // Extract parent_id from req.body
    const { title, desc, img, cat, date, category_id, parent_id } = req.body;

    const q = "INSERT INTO posts(`title`, `desc`, `img`, `cat`, `date`,`uid`, `category_id`, `parent_id`) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";

    const values = [title, desc, img, cat, date, userInfo.id, category_id, parent_id || null];

    db.query(q, values, (err, data) => {
      if (err) return res.status(500).json(err);
      return res.status(200).json("Post has been created.");
    });
  });
});

      app.delete("/server/posts/:id", (req, res) => {
        const token = req.cookies.access_token;
        if (!token) return res.status(401).json("Not authenticated!");
      
        jwt.verify(token, "jwtkey", (err, userInfo) => {
          if (err) return res.status(403).json("Token is not valid!");
      
          const postId = req.params.id;
          const q = "DELETE FROM posts WHERE `id` = ? AND `uid` = ?";
      
          db.query(q, [postId, userInfo.id], (err, data) => {
            if (err) return res.status(403).json("You can delete only your post!");
      
            return res.json("Post has been deleted!");
          });
        });
      });
      app.put("/server/posts/:id", (req, res) => {
        const token = req.cookies.access_token;
        if (!token) return res.status(401).json("Not authenticated!");
      
        jwt.verify(token, "jwtkey", (err, userInfo) => {
          if (err) return res.status(403).json("Token is not valid!");
      
          const postId = req.params.id;
          const q =
            "UPDATE posts SET `title`=?,`desc`=?,`img`=?,`cat`=? WHERE `id` = ? AND `uid` = ?";
      
          const values = [req.body.title, req.body.desc, req.body.img, req.body.cat];
      
          db.query(q, [...values, postId, userInfo.id], (err, data) => {
            if (err) return res.status(500).json(err);
            return res.json("Post has been updated.");
          });
        });
      });
      app.get("/server/categories", (req, res) => {
        const q = "SELECT * FROM categories";  // Assuming you have a 'categories' table
        db.query(q, (err, data) => {
            if (err) {
                console.error('Error fetching categories:', err);
                return res.status(500).json(err);
            }
            res.status(200).json(data); // This will return an array of category objects
        });
    });
    

        // POST endpoint to create a new category
        app.post("/server/categories", (req, res) => {
          const q = "INSERT INTO categories(name) VALUES (?)";
          db.query(q, [req.body.name], (err, result) => {
              if (err) {
                  // Handle duplicate category name error
                  if (err.code === 'ER_DUP_ENTRY') {
                      return res.status(409).json({ message: 'Category already exists' });
                  } else {
                      console.error('Error creating category:', err);
                      return res.status(500).json(err);
                  }
              }
              res.status(201).json({ id: result.insertId, name: req.body.name });
          });
      });

      // app.post("/server/posts/reply", (req, res) => {
      //   // ... authentication code
      //   const q = "INSERT INTO posts(`title`, `desc`, `img`, `cat`, `date`, `uid`, `category_id`, `parent_id`) VALUES (?)";
      //   const values = [
      //     req.body.title,
      //     req.body.desc,
      //     req.body.img,
      //     req.body.cat,
      //     req.body.date,
      //     userInfo.id,
      //     req.body.category_id,
      //     req.body.parent_id,  // This is the new part where you pass the ID of the parent post.
      //   ];
        
      //   db.query(q, [values], (err, data) => {
      //     if (err) return res.status(500).json(err);
      //     return res.json("Reply has been created.");
      //   });
      // });
    
// // POST endpoint to create a new category
// app.post("/server/categories", (req, res) => {
//   const q = "INSERT INTO categories(name) VALUES (?)";
//   db.query(q, [req.body.name], (err, data) => {
//       if (err) {
//           console.error('Error creating category:', err);
//           return res.status(500).json(err);
//       }
//       res.status(201).json({ id: data.insertId, name: req.body.name });
//   });
// });

// // GET endpoint to read categories
// app.get("/server/categories", (req, res) => {
//   const q = "SELECT * FROM categories";
//   db.query(q, (err, data) => {
//       if (err) {
//           console.error('Error fetching categories:', err);
//           return res.status(500).json(err);
//       }
//       res.status(200).json(data);
//   });
// });

// // PUT endpoint to update a category
// app.put("/server/categories/:id", (req, res) => {
//   const q = "UPDATE categories SET name = ? WHERE id = ?";
//   db.query(q, [req.body.name, req.params.id], (err, data) => {
//       if (err) {
//           console.error('Error updating category:', err);
//           return res.status(500).json(err);
//       }
//       res.status(200).json({ message: 'Category updated successfully' });
//   });
// });

// // DELETE endpoint to delete a category
// app.delete("/server/categories/:id", (req, res) => {
//   const q = "DELETE FROM categories WHERE id = ?";
//   db.query(q, [req.params.id], (err, data) => {
//       if (err) {
//           console.error('Error deleting category:', err);
//           return res.status(500).json(err);
//       }
//       res.status(200).json({ message: 'Category deleted successfully' });
//   });
// });


app.listen(3001, () => {
        console.log("Backend server is running on port 3001!");
        }); 